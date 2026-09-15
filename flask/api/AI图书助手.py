# -*- coding: utf-8 -*-
"""大语言模型图书录入接口

- GET /api/ai/status：查看模型配置状态。
- POST /api/ai/books/<id>/extract：从版权页等截图中提取可控字段。
- POST /api/ai/books/<id>/evaluate：根据确认后的书目信息生成中图法、标签和 AI 初评。

对外返回的 JSON 字段保持英文，SQL 表名与字段名使用中文。
"""
import base64
import json
import os
import re
import urllib.error
import urllib.request

from flask import current_app, jsonify, request

from api import api_bp
from api.图书信息 import 查询_图书


允许的提取字段 = {
    'title',
    'author',
    'publisher',
    'publication_year',
    'edition',
    'description',
    'series',
    'isbn',
    'clc',
    'tags',
    'language',
}


def 规范化_模型接口地址(地址):
    """兼容 OpenAI 风格的 base_url 和完整 chat/completions 地址"""
    清洗地址 = (地址 or '').strip().rstrip('/')
    if not 清洗地址:
        return ''
    if 清洗地址.endswith('/chat/completions'):
        return 清洗地址
    return f'{清洗地址}/chat/completions'


def 获取_模型配置():
    """合并配置文件与环境变量中的模型设置"""
    配置 = current_app.config.get('大语言模型', {})
    密钥环境变量 = str(配置.get('API密钥环境变量') or 'AI_API_KEY').strip()
    接口地址 = 规范化_模型接口地址(
        配置.get('接口地址')
        or os.environ.get('AI_API_URL')
        or 'https://api.openai.com/v1'
    )
    模型 = str(配置.get('模型') or os.environ.get('AI_MODEL') or '').strip()
    密钥 = str(
        配置.get('API密钥')
        or os.environ.get(密钥环境变量, '')
        or os.environ.get('OPENAI_API_KEY', '')
    ).strip()
    return {
        '接口地址': 接口地址,
        '模型': 模型,
        '密钥': 密钥,
        '密钥环境变量': 密钥环境变量,
        '超时秒数': int(配置.get('超时秒数') or 120),
        '最大图片数量': int(配置.get('最大图片数量') or 6),
        '最大单图字节': int(配置.get('最大单图字节') or 8 * 1024 * 1024),
        '最大输出token数': int(
            配置.get('最大输出token数')
            or 配置.get('最大输出字符数')
            or 4096
        ),
        '响应格式': str(配置.get('响应格式') or 'json_object').strip(),
        '温度': float(配置.get('温度') or 0),
        '思考模式': str(配置.get('思考模式') or '').strip().lower(),
        '思考强度': str(配置.get('思考强度') or 'low').strip().lower(),
    }


def 获取_配置问题(配置):
    """返回配置缺失说明，配置完整时返回空字符串"""
    if not 配置['接口地址']:
        return '未配置模型接口地址'
    if not 配置['模型']:
        return '未配置模型名称'
    if not 配置['密钥']:
        return f"未配置 API 密钥，请设置环境变量 {配置['密钥环境变量']} 或配置文件中的“API密钥”"
    return ''


def 读取_提示词(文件名):
    """从提示词目录读取 UTF-8 文本"""
    提示词目录 = current_app.config['提示词目录']
    with open(os.path.join(提示词目录, 文件名), 'r', encoding='utf-8') as 文件:
        return 文件.read().strip()


def 解析_数据地址(图片):
    """解析 data URL，返回 MIME 类型与字节内容"""
    数据地址 = ''
    if isinstance(图片, str):
        数据地址 = 图片.strip()
    elif isinstance(图片, dict):
        数据地址 = str(图片.get('data_url') or 图片.get('dataUrl') or '').strip()

    匹配 = re.match(r'^data:(image/(?:png|jpeg|jpg|webp));base64,(.+)$', 数据地址, re.DOTALL)
    if not 匹配:
        raise ValueError('图片必须是 PNG、JPEG 或 WebP 格式的 data URL')

    MIME类型 = 匹配.group(1)
    if MIME类型 == 'image/jpg':
        MIME类型 = 'image/jpeg'

    try:
        图片字节 = base64.b64decode(匹配.group(2), validate=True)
    except (ValueError, base64.binascii.Error):
        raise ValueError('图片 base64 数据无效')

    if not 图片字节:
        raise ValueError('图片内容为空')

    return MIME类型, 图片字节


def 解析_图片列表(请求数据, 配置):
    """校验图片列表，并转换为模型可直接接收的 data URL"""
    原始图片列表 = 请求数据.get('images')
    if not isinstance(原始图片列表, list) or not 原始图片列表:
        raise ValueError('请至少提供一张图书页面截图')
    if len(原始图片列表) > 配置['最大图片数量']:
        raise ValueError(f"最多一次提交 {配置['最大图片数量']} 张图片")

    图片列表 = []
    总字节数 = 0
    for 序号, 原始图片 in enumerate(原始图片列表, start=1):
        MIME类型, 图片字节 = 解析_数据地址(原始图片)
        if len(图片字节) > 配置['最大单图字节']:
            raise ValueError(f'第 {序号} 张图片超过单图大小限制')
        总字节数 += len(图片字节)
        图片列表.append({
            '编号': 序号,
            '标签': str(原始图片.get('label') or '').strip()[:80]
            if isinstance(原始图片, dict)
            else '',
            'data_url': f"data:{MIME类型};base64,{base64.b64encode(图片字节).decode('ascii')}",
        })

    if 总字节数 > 配置['最大单图字节'] * 2:
        raise ValueError('图片总大小过大，请减少图片数量或压缩后重试')
    return 图片列表


def 构建_用户消息(提示文本, 图片列表=None):
    """构建支持文本和图片的 OpenAI 兼容用户消息"""
    内容 = [{'type': 'text', 'text': 提示文本}]
    for 图片 in 图片列表 or []:
        标签 = f"（{图片['标签']}）" if 图片['标签'] else ''
        内容.append({'type': 'text', 'text': f"图 {图片['编号']}{标签}："})
        内容.append({
            'type': 'image_url',
            'image_url': {'url': 图片['data_url']},
        })
    return {'role': 'user', 'content': 内容}


def 调用_模型(系统提示词, 用户提示词, 图片列表=None, 温度=None):
    """调用 OpenAI 兼容的 chat/completions 接口并返回 JSON 对象"""
    配置 = 获取_模型配置()
    配置问题 = 获取_配置问题(配置)
    if 配置问题:
        raise RuntimeError(配置问题)

    请求体 = {
        'model': 配置['模型'],
        'messages': [
            {'role': 'system', 'content': 系统提示词},
            构建_用户消息(用户提示词, 图片列表),
        ],
        'temperature': 配置['温度'] if 温度 is None else 温度,
        'max_tokens': 配置['最大输出token数'],
    }
    if 配置['响应格式'] == 'json_object':
        请求体['response_format'] = {'type': 'json_object'}
    if 配置['思考模式'] in ('enabled', 'disabled'):
        请求体['thinking'] = {'type': 配置['思考模式']}
        if 配置['思考模式'] == 'enabled':
            请求体['reasoning_effort'] = 配置['思考强度'] or 'low'

    请求 = urllib.request.Request(
        配置['接口地址'],
        data=json.dumps(请求体, ensure_ascii=False).encode('utf-8'),
        headers={
            'Authorization': f"Bearer {配置['密钥']}",
            'Content-Type': 'application/json; charset=utf-8',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(请求, timeout=配置['超时秒数']) as 响应:
            响应数据 = json.loads(响应.read().decode('utf-8'))
    except urllib.error.HTTPError as 错误:
        错误正文 = 错误.read().decode('utf-8', errors='replace')
        try:
            错误数据 = json.loads(错误正文)
            错误信息 = (
                错误数据.get('error', {}).get('message')
                if isinstance(错误数据.get('error'), dict)
                else 错误数据.get('error')
            ) or 错误正文
        except json.JSONDecodeError:
            错误信息 = 错误正文
        raise RuntimeError(
            f'模型接口返回 {错误.code}（{配置["接口地址"]}）: {str(错误信息)[:500]}'
        )
    except urllib.error.URLError as 错误:
        raise RuntimeError(f'无法连接模型接口: {错误.reason}')
    except json.JSONDecodeError:
        raise RuntimeError('模型接口返回内容不是 JSON')

    try:
        模型选择 = 响应数据['choices'][0]
        模型消息 = 模型选择['message']
        模型内容 = 模型消息.get('content')
    except (KeyError, IndexError, TypeError):
        raise RuntimeError('模型接口响应缺少 choices[0].message.content')

    if not 模型内容:
        完成原因 = 模型选择.get('finish_reason') or '未知'
        推理内容 = 模型消息.get('reasoning_content') or ''
        推理提示 = '，推理内容占满了输出预算' if 推理内容 else ''
        raise RuntimeError(f'模型没有返回最终内容（finish_reason={完成原因}{推理提示}）')

    if isinstance(模型内容, list):
        模型内容 = ''.join(
            部分.get('text', '') if isinstance(部分, dict) else str(部分)
            for 部分 in 模型内容
        )
    if not isinstance(模型内容, str):
        raise RuntimeError('模型返回内容格式不受支持')

    return 解析_模型JSON(模型内容)


def 解析_模型JSON(模型内容):
    """从模型文本中解析 JSON，并兼容 Markdown 代码块"""
    清洗内容 = 模型内容.strip()
    清洗内容 = re.sub(r'^```(?:json)?\s*', '', 清洗内容, flags=re.IGNORECASE)
    清洗内容 = re.sub(r'\s*```$', '', 清洗内容)
    try:
        return json.loads(清洗内容)
    except json.JSONDecodeError:
        pass

    起始位置 = 清洗内容.find('{')
    结束位置 = 清洗内容.rfind('}')
    if 起始位置 < 0 or 结束位置 <= 起始位置:
        raise RuntimeError('模型没有返回有效 JSON')
    try:
        return json.loads(清洗内容[起始位置:结束位置 + 1])
    except json.JSONDecodeError as 错误:
        raise RuntimeError(f'模型返回的 JSON 无法解析: {错误}')


def 构建_已确认信息(请求数据, 数据库图书):
    """读取用户确认后的字段，未提供时回退到数据库当前值"""
    请求图书 = 请求数据.get('book')
    if not isinstance(请求图书, dict):
        请求图书 = {}

    结果 = {}
    字段映射 = {
        'title': 'title',
        'author': 'author',
        'publisher': 'publisher',
        'publication_year': 'publication_year',
        'edition': 'edition',
        'description': 'description',
        'series': 'series',
        'isbn': 'isbn',
        'clc': 'clc',
        'tags': 'tags',
        'language': 'language',
    }
    for 英文字段, 数据库字段 in 字段映射.items():
        值 = 请求图书.get(英文字段)
        if 值 is None:
            值 = 数据库图书.get(数据库字段)
        if 值 is None:
            continue
        结果[英文字段] = 值
    return 结果


@api_bp.route('/ai/status', methods=['GET'])
def 查询_AI配置状态():
    """返回模型是否可用，不返回密钥内容"""
    配置 = 获取_模型配置()
    配置问题 = 获取_配置问题(配置)
    return jsonify({
        'success': True,
        'data': {
            'configured': not bool(配置问题),
            'message': 配置问题 or '模型配置可用',
            'model': 配置['模型'],
            'endpoint': 配置['接口地址'],
            'max_images': 配置['最大图片数量'],
        },
    })


@api_bp.route('/ai/books/<int:book_id>/extract', methods=['POST'])
def AI提取图书信息(book_id):
    """从图书页面截图中提取书名、作者、出版社等可控字段"""
    图书 = 查询_图书(book_id)
    if not 图书:
        return jsonify({'success': False, 'error': '未找到对应的图书'}), 404

    请求数据 = request.get_json(silent=True)
    if not isinstance(请求数据, dict):
        return jsonify({'success': False, 'error': '请求体必须是 JSON 对象'}), 400

    配置 = 获取_模型配置()
    try:
        图片列表 = 解析_图片列表(请求数据, 配置)
    except ValueError as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 400

    当前信息 = {
        英文字段: 图书.get(英文字段)
        for 英文字段 in 允许的提取字段
        if 图书.get(英文字段) not in (None, '')
    }
    用户提示词 = (
        '请从以下截图中提取图书信息。\n'
        f'数据库当前信息（仅用于比对，不得替代图片证据）：{json.dumps(当前信息, ensure_ascii=False)}'
    )

    try:
        结果 = 调用_模型(
            读取_提示词('图书信息提取.txt'),
            用户提示词,
            图片列表=图片列表,
            温度=0,
        )
    except (OSError, RuntimeError, ValueError) as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 502

    字段结果 = 结果.get('fields')
    if not isinstance(字段结果, dict):
        return jsonify({'success': False, 'error': '模型返回结果缺少 fields 对象'}), 502

    return jsonify({
        'success': True,
        'data': {
            'fields': 字段结果,
            'missing_fields': 结果.get('missing_fields') or [],
            'warnings': 结果.get('warnings') or [],
        },
    })


@api_bp.route('/ai/books/<int:book_id>/evaluate', methods=['POST'])
def AI生成分类与评估(book_id):
    """根据用户确认后的书目信息生成中图法、标签和 AI 初评"""
    图书 = 查询_图书(book_id)
    if not 图书:
        return jsonify({'success': False, 'error': '未找到对应的图书'}), 404

    请求数据 = request.get_json(silent=True)
    if not isinstance(请求数据, dict):
        return jsonify({'success': False, 'error': '请求体必须是 JSON 对象'}), 400

    配置 = 获取_模型配置()
    try:
        图片列表 = 解析_图片列表(请求数据, 配置) if 请求数据.get('images') else []
    except ValueError as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 400

    已确认信息 = 构建_已确认信息(请求数据, 图书)
    用户提示词 = (
        '请根据以下已确认书目信息和截图进行中图法分类与图书初评。\n'
        f'已确认书目信息：{json.dumps(已确认信息, ensure_ascii=False)}'
    )

    try:
        结果 = 调用_模型(
            读取_提示词('图书分类与评估.txt'),
            用户提示词,
            图片列表=图片列表,
            温度=0.2,
        )
    except (OSError, RuntimeError, ValueError) as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 502

    return jsonify({'success': True, 'data': 结果})

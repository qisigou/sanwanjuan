# -*- coding: utf-8 -*-
"""文件上传接口

- POST /api/upload：将浏览器上传的文件保存到配置中的临时文件夹。

对外返回的 JSON 字段保持英文。
"""
import os
import re
from pathlib import Path

from flask import current_app, jsonify, request

from api import api_bp
from api.文件入库 import (
    生成_处理摘要,
    生成_处理消息,
    获取_文件格式,
    处理_临时文件列表,
)


文件名非法字符 = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')


def 获取_安全文件名(原始文件名):
    """去除浏览器文件名中的路径和文件系统非法字符"""
    文件名 = str(原始文件名 or '').replace('\\', '/').split('/')[-1]
    文件名 = 文件名非法字符.sub('_', 文件名).strip(' .')
    return 文件名 or '未命名文件'


def 获取_不重复文件路径(临时文件夹, 文件名):
    """文件名重复时追加序号，避免覆盖临时文件夹中的已有文件"""
    文件路径 = Path(临时文件夹) / 文件名
    if not 文件路径.exists():
        return 文件路径

    主干, 扩展名 = os.path.splitext(文件名)
    序号 = 1
    while True:
        候选路径 = Path(临时文件夹) / f'{主干}_{序号}{扩展名}'
        if not 候选路径.exists():
            return 候选路径
        序号 += 1


@api_bp.route('/upload', methods=['POST'])
def 上传_文件():
    """接收文件、保存到临时文件夹，并立即执行信息采集和归档"""
    临时文件夹 = str(current_app.config.get('临时文件夹') or '').strip()
    if not 临时文件夹:
        return jsonify({'success': False, 'error': '未配置临时文件夹'}), 500

    try:
        Path(临时文件夹).mkdir(parents=True, exist_ok=True)
    except OSError as 错误:
        return jsonify({'success': False, 'error': f'无法创建临时文件夹: {错误}'}), 500

    文件列表 = request.files.getlist('files')
    if not 文件列表:
        文件列表 = request.files.getlist('file')
    有效文件列表 = [文件 for 文件 in 文件列表 if 文件 and 文件.filename]

    if not 有效文件列表:
        return jsonify({'success': False, 'error': '请选择需要上传的文件'}), 400

    不支持文件 = [
        文件.filename
        for 文件 in 有效文件列表
        if not 获取_文件格式(文件.filename)
    ]
    if 不支持文件:
        return jsonify({
            'success': False,
            'error': '仅支持 PDF 和 EPUB 文件',
            'unsupported_files': 不支持文件,
        }), 400

    已保存文件 = []
    保存失败文件 = []
    已保存路径 = []

    for 文件 in 有效文件列表:
        原始文件名 = 文件.filename
        安全文件名 = 获取_安全文件名(原始文件名)
        保存路径 = 获取_不重复文件路径(临时文件夹, 安全文件名)

        try:
            文件.save(str(保存路径))
        except OSError as 错误:
            保存失败文件.append({
                'original_name': 原始文件名,
                'error': str(错误),
            })
            continue

        已保存文件.append({
            'original_name': 原始文件名,
            'saved_name': 保存路径.name,
        })
        已保存路径.append(str(保存路径))

    if not 已保存路径:
        return jsonify({
            'success': False,
            'error': f'{len(保存失败文件)} 个文件上传失败',
            'files': 已保存文件,
            'failed': 保存失败文件,
        }), 500

    处理结果 = 处理_临时文件列表(已保存路径)
    处理摘要 = 生成_处理摘要(处理结果)
    处理成功 = 处理摘要['failed_count'] == 0 and not 保存失败文件
    消息 = 生成_处理消息(处理摘要)
    if 保存失败文件:
        消息 = f'{len(保存失败文件)} 个文件保存失败；{消息}'

    return jsonify({
        'success': 处理成功,
        'message': 消息,
        'files': 已保存文件,
        'import': 处理摘要,
        'failed': 保存失败文件,
    }), (201 if 处理成功 else 500)

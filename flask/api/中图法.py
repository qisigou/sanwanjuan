# -*- coding: utf-8 -*-
"""中图法（中国图书馆分类法）分类树接口

- GET /api/ztf/children：返回顶层分类（含"未分类"虚拟节点）
- GET /api/ztf/children?分类号=XXX：返回指定分类的直接子分类
- GET /api/ztf/books?分类号=XXX：返回该分类（含子分类）下的图书（分页）

图书统计只计入 存储状态='正常' 的书，与"分类图书列表"保持一致。
"""
from contextlib import closing
import os

from flask import Blueprint, current_app, jsonify, request

from api import api_bp
from api.搜索 import 类_图书检索

每页默认条数 = 20
每页最大条数 = 100

_分类统计缓存 = None
_分类统计缓存数据库指纹 = None


def 获取_数据库文件指纹():
    """返回数据库文件版本，用于在数据库更新后刷新统计缓存"""
    数据库路径 = current_app.config['数据库地址']
    文件状态 = os.stat(数据库路径)
    return 文件状态.st_mtime_ns, 文件状态.st_size


def 获取_分类统计():
    """返回 (节点字典, 顶层字母集合, 未分类数量)，结果缓存避免重复计算"""
    global _分类统计缓存, _分类统计缓存数据库指纹
    数据库指纹 = 获取_数据库文件指纹()
    if _分类统计缓存 is None or _分类统计缓存数据库指纹 != 数据库指纹:
        _分类统计缓存 = 构建_分类统计()
        _分类统计缓存数据库指纹 = 数据库指纹
    return _分类统计缓存


def 构建_分类统计():
    """构建中图法树节点、父子关系与书目统计"""
    with closing(类_图书检索.获取_数据库连接()) as 连接:
        cursor = 连接.cursor()
        cursor.execute('SELECT 分类号, 分类名称 FROM 中图法_v5')
        分类列表 = cursor.fetchall()
        cursor.execute(
            "SELECT 中图法, COUNT(*) FROM 书籍 "
            "WHERE 存储状态 = '正常' AND 中图法 IS NOT NULL AND TRIM(中图法) != '' "
            "GROUP BY 中图法"
        )
        图书计数 = cursor.fetchall()
        cursor.close()

    节点字典 = {}
    for 分类号, 分类名称 in 分类列表:
        节点字典[分类号.strip()] = {
            '分类名称': 分类名称,
            '直接数量': 0,
            '汇总数量': 0,
            '父分类号': None,
            '子节点数量': 0,
        }

    顶层字母 = {分类号 for 分类号 in 节点字典 if len(分类号) == 1}

    def 解析_最深层节点(值):
        """把图书的中图法取值解析为树中最深匹配的分类号；无效值返回 None"""
        值 = 值.strip()
        if not 值 or 值[0] not in 顶层字母:
            return None
        # 只取第一个逗号分隔的部分，保证一本书只统计一次
        for 部分 in 值.split(','):
            部分 = 部分.strip()
            if not 部分:
                continue
            候选 = 部分
            while 候选:
                if 候选 in 节点字典:
                    return 候选
                候选 = 候选[:-1]
        return None

    for 图书分类号, 数量 in 图书计数:
        节点 = 解析_最深层节点(图书分类号)
        if 节点:
            节点字典[节点]['直接数量'] += 数量

    # 计算父分类号与子节点数量
    for 分类号 in 节点字典:
        父 = None
        候选 = 分类号[:-1]
        while 候选:
            if 候选 in 节点字典:
                父 = 候选
                break
            候选 = 候选[:-1]
        节点字典[分类号]['父分类号'] = 父
        if 父:
            节点字典[父]['子节点数量'] += 1

    # 汇总数量：按分类号长度从深到浅累加到父节点
    排序 = sorted(节点字典, key=len, reverse=True)
    for 分类号 in 排序:
        节点 = 节点字典[分类号]
        节点['汇总数量'] = 节点['直接数量']
    for 分类号 in 排序:
        节点 = 节点字典[分类号]
        父 = 节点['父分类号']
        if 父:
            节点字典[父]['汇总数量'] += 节点['汇总数量']

    # 未分类数量（存储状态正常且无法匹配到顶层分类）
    占位 = ','.join('?' * len(顶层字母))
    with closing(类_图书检索.获取_数据库连接()) as 连接:
        cursor = 连接.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM 书籍 WHERE 存储状态 = '正常' AND "
            f"(中图法 IS NULL OR TRIM(中图法) = '' "
            f"OR substr(TRIM(中图法), 1, 1) NOT IN ({占位}))",
            list(顶层字母),
        )
        未分类数量 = cursor.fetchone()[0]
        cursor.close()

    return 节点字典, 顶层字母, 未分类数量


def 获取_子节点列表(父分类号):
    """返回某分类的直接子分类；父分类号为空时返回顶层分类"""
    节点字典, 顶层字母, 未分类数量 = 获取_分类统计()

    if 父分类号 is None:
        子节点 = [分类号 for 分类号 in 节点字典 if len(分类号) == 1]
    else:
        子节点 = [分类号 for 分类号, 节点 in 节点字典.items() if 节点['父分类号'] == 父分类号]
    子节点.sort()

    结果 = []
    for 分类号 in 子节点:
        节点 = 节点字典[分类号]
        结果.append({
            '分类号': 分类号,
            '分类名称': 节点['分类名称'],
            '直接数量': 节点['直接数量'],
            '汇总数量': 节点['汇总数量'],
            '有子节点': 节点['子节点数量'] > 0,
        })

    if 父分类号 is None:
        结果.append({
            '分类号': '未分类',
            '分类名称': '未分类（无法匹配中图法）',
            '直接数量': 未分类数量,
            '汇总数量': 未分类数量,
            '有子节点': False,
        })
    return 结果


def 构建_分类图书查询(分类号):
    """根据分类号构造图书列表查询条件；返回 (where 语句, 参数)"""
    节点字典, 顶层字母, _ = 获取_分类统计()
    if 分类号 == '未分类':
        占位 = ','.join('?' * len(顶层字母))
        where语句 = (
            "存储状态 = '正常' AND (中图法 IS NULL OR TRIM(中图法) = '' "
            f"OR substr(TRIM(中图法), 1, 1) NOT IN ({占位}))"
        )
        return where语句, list(顶层字母)
    if 分类号 not in 节点字典:
        return '1 = 0', []
    return "存储状态 = '正常' AND 中图法 LIKE ?", [f'{分类号}%']


def 获取_分页参数():
    """从请求参数中解析页码与每页条数"""
    try:
        页码 = max(1, int(request.args.get('page', 1)))
    except (TypeError, ValueError):
        页码 = 1
    try:
        每页 = max(1, min(每页最大条数, int(request.args.get('per_page', 每页默认条数))))
    except (TypeError, ValueError):
        每页 = 每页默认条数
    return 页码, 每页


@api_bp.route('/ztf/children')
def 中图法_子节点():
    """返回指定分类的直接子分类（省略分类号时为顶层分类）"""
    分类号 = request.args.get('分类号', '').strip() or None
    try:
        return jsonify({'成功': True, '节点': 获取_子节点列表(分类号)})
    except Exception as e:
        return jsonify({'成功': False, 'error': str(e)}), 500


@api_bp.route('/ztf/books')
def 中图法_图书():
    """返回某分类（含子分类）下的图书列表，分页"""
    分类号 = request.args.get('分类号', '').strip()
    if not 分类号:
        return jsonify({'error': '分类号参数缺失'}), 400
    页码, 每页 = 获取_分页参数()
    try:
        where语句, 参数 = 构建_分类图书查询(分类号)
        with closing(类_图书检索.获取_数据库连接()) as 连接:
            cursor = 连接.cursor()
            cursor.execute(f'SELECT COUNT(*) FROM 书籍 WHERE {where语句}', 参数)
            总数 = cursor.fetchone()[0]
            偏移 = (页码 - 1) * 每页
            cursor.execute(
                f'SELECT id, 书名, 作者, 出版社, 出版时间, 文件格式 FROM 书籍 '
                f'WHERE {where语句} ORDER BY id DESC LIMIT ? OFFSET ?',
                参数 + [每页, 偏移],
            )
            行列表 = cursor.fetchall()
            cursor.close()

        数据 = [{
            'id': 行[0],
            '书名': 行[1],
            '作者': 行[2],
            '出版社': 行[3],
            '出版时间': 行[4],
            '文件格式': 行[5],
        } for 行 in 行列表]

        return jsonify({
            'query': f'分类号: {分类号}',
            'page': 页码,
            'per_page': 每页,
            'total': 总数,
            'total_pages': (总数 + 每页 - 1) // 每页 if 总数 > 0 else 0,
            'data': 数据,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

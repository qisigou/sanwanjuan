# -*- coding: utf-8 -*-
"""图书基本信息查询与维护接口

- GET /api/books：按入库时间倒序返回图书，可按 id 精确查询。
- PUT /api/books/<id>：修改图书的基本信息。

对外返回的 JSON 字段保持英文，SQL 表名与字段名使用中文。
"""
import sqlite3
import time

from flask import current_app, jsonify, request

from api import api_bp


可编辑字段映射 = {
    'title': '书名',
    'author': '作者',
    'publisher': '出版社',
    'publication_year': '出版时间',
    'edition': '版次',
    'description': '内容简介',
    'series': '所属丛卷',
    'isbn': 'isbn',
    'clc': '中图法',
    'tags': '标签',
    'language': '文本语言',
    'ai_score': 'ai评分',
    'ai_assessment_status': 'ai评估状态码',
    'ai_evaluation': 'ai评估',
}

整数字段 = {'publication_year', 'edition', 'ai_score', 'ai_assessment_status'}

查询字段 = '''
    id,
    书名 AS title,
    作者 AS author,
    出版社 AS publisher,
    出版时间 AS publication_year,
    版次 AS edition,
    内容简介 AS description,
    所属丛卷 AS series,
    isbn,
    中图法 AS clc,
    标签 AS tags,
    文本语言 AS language,
    ai评分 AS ai_score,
    ai评估状态码 AS ai_assessment_status,
    ai评估 AS ai_evaluation,
    文件格式 AS file_format,
    存储位置 AS storage_location,
    存储文件名 AS storage_file_name,
    存储状态 AS storage_status,
    入库时间 AS created_at,
    更新时间 AS updated_at
'''


def 获取_数据库连接():
    """返回可控制事务的 SQLite 连接"""
    return sqlite3.connect(
        current_app.config['数据库地址'],
        timeout=30,
        isolation_level=None,
    )


def 转换_图书行(行, 列名):
    """把查询结果转换为字段名固定的字典"""
    return dict(zip(列名, 行))


def 校验_分页参数(页码, 每页条数):
    """规范化分页参数"""
    try:
        页码 = int(页码) if 页码 else 1
        每页条数 = int(每页条数) if 每页条数 else 20
    except (TypeError, ValueError):
        raise ValueError('分页参数必须是整数')

    if 页码 < 1 or 每页条数 < 1:
        raise ValueError('分页参数必须大于 0')

    return 页码, min(每页条数, 100)


def 查询_图书(书籍ID):
    """按 ID 查询一本图书，不存在时返回 None"""
    连接 = 获取_数据库连接()
    try:
        游标 = 连接.execute(
            f'SELECT {查询字段} FROM 书籍 WHERE id = ?',
            (书籍ID,),
        )
        列名 = [列[0] for 列 in 游标.description]
        行 = 游标.fetchone()
        return 转换_图书行(行, 列名) if 行 else None
    finally:
        连接.close()


@api_bp.route('/books', methods=['GET'])
def 查询_图书列表():
    """按入库时间倒序分页返回图书，支持按 id 精确查询"""
    try:
        页码, 每页条数 = 校验_分页参数(
            request.args.get('page'),
            request.args.get('per_page'),
        )
        书籍ID = request.args.get('id', '').strip()
        if 书籍ID:
            书籍ID = int(书籍ID)
            if 书籍ID < 1:
                raise ValueError('图书 ID 必须大于 0')
    except ValueError as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 400

    try:
        连接 = 获取_数据库连接()
        try:
            条件 = 'WHERE id = ?' if 书籍ID else ''
            参数 = (书籍ID,) if 书籍ID else ()
            总数 = 连接.execute(
                f'SELECT COUNT(*) FROM 书籍 {条件}',
                参数,
            ).fetchone()[0]

            偏移 = (页码 - 1) * 每页条数
            游标 = 连接.execute(
                f'''SELECT {查询字段}
                    FROM 书籍
                    {条件}
                    ORDER BY COALESCE(入库时间, 0) DESC, id DESC
                    LIMIT ? OFFSET ?''',
                参数 + (每页条数, 偏移),
            )
            列名 = [列[0] for 列 in 游标.description]
            数据 = [转换_图书行(行, 列名) for 行 in 游标.fetchall()]
        finally:
            连接.close()
    except sqlite3.Error as 错误:
        return jsonify({'success': False, 'error': f'数据库错误: {错误}'}), 500

    总页数 = (总数 + 每页条数 - 1) // 每页条数 if 总数 else 0
    return jsonify({
        'success': True,
        'data': 数据,
        'pagination': {
            'page': 页码,
            'per_page': 每页条数,
            'total': 总数,
            'total_pages': 总页数,
        },
    })


@api_bp.route('/books/<int:book_id>', methods=['PUT'])
def 更新_图书信息(book_id):
    """修改图书基本信息，不修改入库时间"""
    书籍ID = book_id
    数据 = request.get_json(silent=True)
    if not isinstance(数据, dict):
        return jsonify({'success': False, 'error': '请求体必须是 JSON 对象'}), 400

    更新字段 = []
    参数 = []
    for 英文字段, 中文字段 in 可编辑字段映射.items():
        if 英文字段 not in 数据:
            continue

        值 = 数据[英文字段]
        if 英文字段 in 整数字段:
            if 值 in (None, ''):
                值 = None
            else:
                try:
                    值 = int(值)
                except (TypeError, ValueError):
                    return jsonify({
                        'success': False,
                        'error': f'{英文字段} 必须是整数或空值',
                    }), 400

        if 英文字段 == 'ai_score' and 值 is not None and not 1 <= 值 <= 5:
            return jsonify({
                'success': False,
                'error': 'ai_score 必须在 1 到 5 之间',
            }), 400

        更新字段.append(f'{中文字段} = ?')
        参数.append(值)

    if not 更新字段:
        return jsonify({'success': False, 'error': '没有可修改的字段'}), 400

    连接 = 获取_数据库连接()
    try:
        连接.execute('BEGIN IMMEDIATE')
        存在 = 连接.execute('SELECT 1 FROM 书籍 WHERE id = ?', (书籍ID,)).fetchone()
        if not 存在:
            连接.execute('ROLLBACK')
            return jsonify({'success': False, 'error': '未找到对应的图书'}), 404

        更新字段.append('更新时间 = ?')
        参数.extend([int(time.time()), 书籍ID])
        连接.execute(
            f"UPDATE 书籍 SET {', '.join(更新字段)} WHERE id = ?",
            参数,
        )
        连接.execute('COMMIT')
    except sqlite3.Error as 错误:
        try:
            连接.execute('ROLLBACK')
        except sqlite3.Error:
            pass
        return jsonify({'success': False, 'error': f'数据库错误: {错误}'}), 500
    finally:
        连接.close()

    return jsonify({
        'success': True,
        'message': '图书信息修改成功',
        'data': 查询_图书(书籍ID),
    })

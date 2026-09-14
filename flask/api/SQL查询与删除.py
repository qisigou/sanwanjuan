# -*- coding: utf-8 -*-
"""SQL 查询与软删除接口

- POST /api/query：仅允许 SELECT（含 WITH 开头的只读查询），全量缓存后分页返回
- POST /api/delete：按 id 将图书的存储状态标记为"缺失"（软删除）

/api/query 从语句校验与数据库连接两层封锁写权限：非只读语句直接拒绝，
数据库连接以 mode=ro 只读方式打开，杜绝任何 INSERT / UPDATE / DELETE / DDL。

对外返回的 JSON 字段保持英文，SQL 表名与字段名使用中文。
"""
import hashlib
import re
import sqlite3
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request

from api import api_bp
from api.搜索 import 类_图书检索

# 全局缓存字典：key=SQL 的 MD5，value={'columns': [], 'rows': [全部行], 'total': 总行数}
查询缓存 = {}

# 允许执行的只读语句首关键字：SELECT 直接查询，WITH 用于公共表表达式
允许的只读语句关键字 = ('SELECT', 'WITH')

# 语句开头可能出现的注释，识别首关键字前先跳过
开头注释 = re.compile(r'^\s*(?:--[^\n]*(?:\n|$)|/\*.*?\*/)', re.DOTALL)


def 去除_开头注释(语句):
    """移除语句开头的空白与注释，便于识别首个关键字"""
    剩余 = 语句
    while True:
        匹配 = 开头注释.match(剩余)
        if not 匹配:
            return 剩余.strip()
        剩余 = 剩余[匹配.end():]


def 校验_只读查询(语句):
    """校验语句是否为只读查询，返回 (是否允许, 拒绝原因)"""
    首个词 = re.match(r'[A-Za-z]+', 去除_开头注释(语句))
    if not 首个词 or 首个词.group(0).upper() not in 允许的只读语句关键字:
        return False, '仅允许执行 SELECT 查询语句，其他操作已禁用'
    return True, ''


def 获取_数据库连接():
    """返回支持按列名访问的数据库连接"""
    连接 = 类_图书检索.获取_数据库连接()
    连接.row_factory = sqlite3.Row  # 使返回结果支持列名访问
    return 连接


def 获取_只读数据库连接():
    """以只读模式打开数据库，从连接层面杜绝任何写操作"""
    数据库地址 = Path(current_app.config['数据库地址']).as_uri()
    连接 = sqlite3.connect(f'{数据库地址}?mode=ro', uri=True)
    连接.row_factory = sqlite3.Row  # 使返回结果支持列名访问
    return 连接


@api_bp.route('/query', methods=['POST'])
def 执行_查询():
    """执行只读 SQL：仅允许 SELECT，查询结果全量缓存后分页返回"""
    数据 = request.get_json() or {}
    查询语句 = (数据.get('sql') or '').strip()
    页码 = 数据.get('page', 1)
    每页条数 = 数据.get('page_size', 1000)

    # 参数校验
    try:
        页码 = int(页码)
        每页条数 = int(每页条数)
    except (TypeError, ValueError):
        页码, 每页条数 = 1, 1000
    每页条数 = max(1, min(1000, 每页条数))
    if not 查询语句:
        return jsonify({'error': 'SQL 不能为空'}), 400

    # 语句校验：仅放行只读查询，其余一律拒绝
    是否允许, 拒绝原因 = 校验_只读查询(查询语句)
    if not 是否允许:
        return jsonify({'success': False, 'error': 拒绝原因}), 403

    查询语句 = 查询语句.rstrip(';').rstrip()

    # SELECT 语句：检查缓存
    缓存键 = hashlib.md5(查询语句.encode('utf-8')).hexdigest()

    if 缓存键 in 查询缓存:
        # 缓存命中，直接切片返回
        缓存内容 = 查询缓存[缓存键]
        列名 = 缓存内容['columns']
        全部行 = 缓存内容['rows']
        总数 = 缓存内容['total']

        偏移 = (页码 - 1) * 每页条数
        分页行 = 全部行[偏移:偏移 + 每页条数]
        总页数 = (总数 + 每页条数 - 1) // 每页条数 if 总数 > 0 else 1

        return jsonify({
            'success': True,
            'columns': 列名,
            'rows': 分页行,
            'pagination': {
                'page': 页码,
                'page_size': 每页条数,
                'total': 总数,
                'total_pages': 总页数,
                'has_previous': 页码 > 1,
                'has_next': 页码 < 总页数
            }
        })

    # 缓存未命中：执行查询，取出全部数据存入缓存（只读连接）
    连接 = 获取_只读数据库连接()
    游标 = 连接.cursor()
    try:
        游标.execute(查询语句)
        全部行 = 游标.fetchall()
        列名 = [列[0] for 列 in 游标.description] if 游标.description else []
        行列表 = [list(行) for 行 in 全部行]
        总数 = len(行列表)

        # 存入缓存（无任何限制，全量存储）
        查询缓存[缓存键] = {
            'columns': 列名,
            'rows': 行列表,
            'total': 总数
        }

        # 返回请求的页
        偏移 = (页码 - 1) * 每页条数
        分页行 = 行列表[偏移:偏移 + 每页条数]
        总页数 = (总数 + 每页条数 - 1) // 每页条数 if 总数 > 0 else 1

        return jsonify({
            'success': True,
            'columns': 列名,
            'rows': 分页行,
            'pagination': {
                'page': 页码,
                'page_size': 每页条数,
                'total': 总数,
                'total_pages': 总页数,
                'has_previous': 页码 > 1,
                'has_next': 页码 < 总页数
            }
        })
    except sqlite3.Warning:
        return jsonify({'success': False, 'error': '仅允许执行单条 SELECT 语句'}), 400
    except sqlite3.ProgrammingError as e:
        return jsonify({'success': False, 'error': f'SQL 语句无效: {str(e)}'}), 400
    except sqlite3.DatabaseError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        游标.close()
        连接.close()


@api_bp.route('/delete', methods=['POST'])
def 软删除_书籍():
    """前端传入 id，将图书的存储状态标记为缺失（软删除）"""
    数据 = request.get_json() or {}
    书籍_id = 数据.get('id')

    if 书籍_id is None:
        return jsonify({'success': False, 'error': '缺少必要参数: id'}), 400

    连接 = 获取_数据库连接()
    游标 = 连接.cursor()

    try:
        # 检查表是否存在存储状态字段
        游标.execute("PRAGMA table_info(书籍)")
        字段列表 = [字段[1] for 字段 in 游标.fetchall()]

        if '存储状态' not in 字段列表:
            游标.execute("ALTER TABLE 书籍 ADD COLUMN 存储状态 TEXT DEFAULT ''")
            连接.commit()

        # 执行更新
        游标.execute("UPDATE 书籍 SET 存储状态 = '缺失' WHERE id = ?", (书籍_id,))
        连接.commit()

        if 游标.rowcount == 0:
            return jsonify({'success': False, 'message': '未找到对应记录'}), 404

        return jsonify({
            'success': True,
            'message': f'已将记录 ID={书籍_id} 标记为缺失'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        连接.close()

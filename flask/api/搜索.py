# -*- coding: utf-8 -*-
"""图书检索接口

- GET /api/search-name：按书名检索图书（分页）
- GET /api/search-all：按书名 / 作者多字段检索图书（分页）
- GET /api/search-id：按 ID 查询图书文件并返回（可下载）

对外返回的 JSON 字段保持英文，SQL 表名与字段名使用中文。
"""
import os
import sqlite3
from contextlib import closing
from urllib.parse import quote

from flask import Blueprint, current_app, jsonify, redirect, request, send_file

from api import api_bp
from api.文件存储 import 拼接_文件路径, 获取_文件_MIME类型, 生成_安全下载文件名


class 类_图书检索:
    """图书检索与文件查询的公共方法集合"""

    @staticmethod
    def 获取_数据库连接():
        """返回应用配置中的 SQLite 数据库连接"""
        return sqlite3.connect(current_app.config['数据库地址'])

    @staticmethod
    def 校验_分页参数(页码, 每页条数):
        """校验并规范化分页参数，非法时抛出 ValueError"""
        try:
            页码 = int(页码) if 页码 else 1
            每页条数 = int(每页条数) if 每页条数 else 50
        except ValueError:
            raise ValueError("页码和每页条数参数必须是整数")

        if 页码 < 1 or 每页条数 < 1:
            raise ValueError("页码和每页条数必须大于 0")

        return 页码, 每页条数

    @staticmethod
    def 执行_搜索(关键词, 搜索字段, 页码=1, 每页条数=20):
        """按指定字段模糊检索图书，返回分页结果"""
        偏移 = (页码 - 1) * 每页条数

        with closing(类_图书检索.获取_数据库连接()) as 连接:
            游标 = 连接.cursor()

            # 构建基础查询
            基础查询 = "SELECT id, 书名, 作者, 出版社, 出版时间, 文件格式 FROM 书籍"
            计数查询 = "SELECT COUNT(*) FROM 书籍"

            # 有检索条件时构建 WHERE 子句
            if 关键词:
                where子句 = " OR ".join([f"{字段} LIKE ?" for 字段 in 搜索字段])
                参数 = [f"%{关键词}%"] * len(搜索字段)

                # 完整查询
                完整查询 = f"{基础查询} WHERE {where子句} LIMIT ? OFFSET ?"
                完整计数查询 = f"{计数查询} WHERE {where子句}"

                # 执行计数查询
                游标.execute(完整计数查询, 参数)
                总数 = 游标.fetchone()[0]

                # 执行数据查询
                游标.execute(完整查询, 参数 + [每页条数, 偏移])
            else:
                # 无检索条件时返回全部图书
                游标.execute(计数查询)
                总数 = 游标.fetchone()[0]

                游标.execute(f"{基础查询} LIMIT ? OFFSET ?", (每页条数, 偏移))

            # 处理结果
            列名 = [列[0] for 列 in 游标.description]
            结果 = [dict(zip(列名, 行)) for 行 in 游标.fetchall()]

            return {
                "query": 关键词,
                "page": 页码,
                "per_page": 每页条数,
                "total": 总数,
                "total_pages": (总数 + 每页条数 - 1) // 每页条数,
                "data": 结果
            }


@api_bp.route("/search-name", methods=["GET"])
def 搜索_书名():
    """按书名检索图书（分页）"""
    try:
        关键词 = request.args.get('q', '').strip()
        页码, 每页条数 = 类_图书检索.校验_分页参数(
            request.args.get('page'),
            request.args.get('per_page')
        )

        结果 = 类_图书检索.执行_搜索(关键词, ["书名"], 页码, 每页条数)
        return jsonify(结果)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except sqlite3.Error as e:
        return jsonify({"error": f"数据库错误: {str(e)}"}), 500


@api_bp.route("/search-all", methods=["GET"])
def 搜索_多字段():
    """按书名 / 作者多字段检索图书（分页）"""
    try:
        关键词 = request.args.get('q', '').strip()
        页码, 每页条数 = 类_图书检索.校验_分页参数(
            request.args.get('page'),
            request.args.get('per_page')
        )

        结果 = 类_图书检索.执行_搜索(关键词, ["书名", "作者"], 页码, 每页条数)
        return jsonify(结果)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except sqlite3.Error as e:
        return jsonify({"error": f"数据库错误: {str(e)}"}), 500


@api_bp.route("/search-id", methods=["GET"])
@api_bp.route("/search-id/<filename>", methods=["GET"])
@api_bp.route("/search-id/<int:book_id>/<filename>", methods=["GET"])
def 查询_按_ID(filename=None, book_id=None):
    """按 ID 查询图书文件，默认内联展示，download=1 时作为附件下载"""
    # 获取请求参数
    书籍_id = book_id if book_id is not None else request.args.get('bookID')
    是否下载 = book_id is not None or request.args.get('download', '0') == '1'

    if not 书籍_id:
        return jsonify({"error": "bookID参数缺失"}), 400

    try:
        # 执行数据库查询，使用参数化查询防止 SQL 注入
        查询语句 = "SELECT 书名, 作者, 出版社, 存储位置, 存储文件名, 文件格式 FROM 书籍 WHERE id = ?"
        连接 = 类_图书检索.获取_数据库连接()
        游标 = 连接.cursor()
        游标.execute(查询语句, (书籍_id,))
        结果 = 游标.fetchone()

        # 关闭连接
        游标.close()
        连接.close()

        if not 结果:
            return jsonify({"error": "未找到对应的图书"}), 404

        # 提取文件路径信息
        书名 = 结果[0]
        作者 = 结果[1]
        出版社 = 结果[2]
        存储位置 = 结果[3]
        存储文件名 = 结果[4]
        文件格式 = 结果[5] or os.path.splitext(存储文件名)[1]  # 字段为空时用扩展名兜底

        # 拼接完整文件路径（目录按文件格式选择）
        文件_路径 = 拼接_文件路径(存储位置, 存储文件名, 文件格式)

        # 检查文件是否存在
        if not os.path.exists(文件_路径):
            return jsonify({"error": "文件不存在"}), 404

        # 默认内联展示（PDF 可直接在浏览器打开），download=1 时作为附件下载
        下载文件名 = 生成_安全下载文件名(书名, 作者, 出版社, 文件格式, 存储文件名)
        if 是否下载 and filename is None:
            下载地址 = (
                f'{request.host_url.rstrip("/")}/api/search-id/{书籍_id}/'
                f'{quote(下载文件名, safe="")}'
            )
            return redirect(下载地址, code=302)

        响应 = send_file(
            文件_路径,
            as_attachment=是否下载,
            download_name=下载文件名,
            mimetype=获取_文件_MIME类型(文件格式)
        )

        # 添加额外的响应头信息（Content-Disposition 由 send_file 按 RFC 5987 自动编码，勿手动覆盖）
        响应.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        响应.headers['Pragma'] = 'no-cache'
        响应.headers['Expires'] = '0'

        return 响应

    except Exception as e:
        # 记录错误日志
        print(f"文件下载错误: {str(e)}")
        return jsonify({"error": "服务器内部错误"}), 500

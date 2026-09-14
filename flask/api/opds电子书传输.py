# -*- coding: utf-8 -*-
"""实现 OPDS 1.2 目录接口，供支持 OPDS 协议的阅读器接入

提供的接口（蓝图前缀 /api）：
- /api/opds/ 与 /api/opds/root.xml：导航目录（含检索入口与格式分类）
- /api/opds/books：全部图书获取目录（支持分页与格式筛选）
- /api/opds/search：按书名 / 作者 / 出版社检索
- /api/opds/opensearch.xml：OpenSearch 描述文档

阅读器可通过各目录中的检索模板搜索图书，并通过"获取"链接直接下载图书文件。
"""
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from xml.sax.saxutils import escape, quoteattr

from flask import Response, request

from api import api_bp
from api.搜索 import 类_图书检索
from api.文件存储 import 获取_文件_MIME类型, 规范化_文件格式, 生成_安全下载文件名

# OPDS / Atom 命名空间
原子命名空间 = 'http://www.w3.org/2005/Atom'
OPDS命名空间 = 'http://opds-spec.org/2010/catalog'
DCTERMS命名空间 = 'http://purl.org/dc/terms/'
OPENSEARCH命名空间 = 'http://a9.com/-/spec/opensearch/1.1/'

导航目录MIME = 'application/atom+xml;profile=opds-catalog;kind=navigation'
获取目录MIME = 'application/atom+xml;profile=opds-catalog;kind=acquisition'
OPENSEARCH_MIME = 'application/opensearchdescription+xml'

站点名称 = '人生三万卷'
每页默认条数 = 20
每页最大条数 = 100
摘要最大长度 = 2000

# 获取目录中使用的书籍字段
书籍查询字段 = (
    'id, 书名, 作者, 出版社, 出版时间, 内容简介, ai评估, 中图法, 标签, '
    '文本语言, 文件格式, 存储文件名, 更新时间, 入库时间'
)


def 转义_文本(值):
    """转义 XML 文本内容"""
    if 值 is None:
        return ''
    return escape(str(值))


def 转义_属性(值):
    """转义 XML 属性值"""
    return quoteattr(str(值 if 值 is not None else ''))


def 截断_摘要片段(文本, 最大长度):
    """按字符数截断摘要片段，并在截断时添加省略号"""
    if 最大长度 <= 0:
        return ''
    if len(文本) <= 最大长度:
        return 文本
    if 最大长度 <= 2:
        return '…' * 最大长度
    return 文本[:最大长度 - 2].rstrip() + '……'


def 获取_站点根地址():
    """根据请求获取站点根地址，如 http://127.0.0.1:5000"""
    return request.host_url.rstrip('/')


def 获取_当前时间():
    """当前 UTC 时间的 RFC 3339 格式"""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def 格式化_时间戳(时间戳):
    """Unix 时间戳转 RFC 3339 格式；为空或异常时使用当前时间"""
    try:
        数值 = int(时间戳)
        if 数值 <= 0:
            return 获取_当前时间()
        return datetime.fromtimestamp(数值, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    except (TypeError, ValueError):
        return 获取_当前时间()


def 格式化_出版时间(出版时间):
    """把出版时间整理成合法的日期；无法判断时返回 None"""
    if 出版时间 is None:
        return None
    文本 = str(出版时间).strip()
    if not 文本.isdigit():
        return None
    数值 = int(文本)
    if 1000 <= 数值 <= 9999:
        return 文本
    if 100000 <= 数值 <= 999999:  # YYYYMM
        return f'{文本[0:4]}-{文本[4:6]}'
    if 10000000 <= 数值 <= 99999999:  # YYYYMMDD
        return f'{文本[0:4]}-{文本[4:6]}-{文本[6:8]}'
    return None


def 生成_条目_id(书籍_id):
    """生成稳定的 tag URI 作为 Atom 条目 id"""
    return f'tag:{request.host},{datetime.now().year}:book/{书籍_id}'


def 获取_数据库连接():
    连接 = 类_图书检索.获取_数据库连接()
    连接.row_factory = sqlite3.Row
    return 连接


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


def 生成_链接(关系, 地址, 类型值):
    """生成一个 Atom link 元素"""
    return (f'    <link rel={转义_属性(关系)} href={转义_属性(地址)} '
            f'type={转义_属性(类型值)}/>\n')


def 生成_检索链接列表(根地址):
    """生成 OpenSearch 描述与服务端检索模板链接"""
    return [
        ('search', f'{根地址}/api/opds/opensearch.xml', OPENSEARCH_MIME),
        ('search', f'{根地址}/api/opds/search?q={{searchTerms}}', 获取目录MIME),
    ]


def 生成_提要(标题, 目录id, 链接列表, 条目块, 统计块=''):
    """生成完整 OPDS 提要 XML"""
    链接块 = ''.join(生成_链接(*链接) for 链接 in 链接列表)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="{原子命名空间}"
      xmlns:opds="{OPDS命名空间}"
      xmlns:dcterms="{DCTERMS命名空间}"
      xmlns:os="{OPENSEARCH命名空间}"
      xml:lang="zh">
  <id>{转义_文本(目录id)}</id>
  <title>{转义_文本(标题)}</title>
  <updated>{获取_当前时间()}</updated>
  <author>
    <name>{转义_文本(站点名称)}</name>
  </author>
{统计块}{链接块}{条目块}</feed>'''


def 返回_提要(xml文本, 类型):
    响应 = Response(xml文本)
    响应.headers['Content-Type'] = f'{类型}; charset=utf-8'
    return 响应


def 生成_导航条目(标题, 地址, 描述):
    """生成导航目录的子目录条目"""
    return f'''  <entry>
    <title>{转义_文本(标题)}</title>
    <id>{转义_文本(地址)}</id>
    <updated>{获取_当前时间()}</updated>
    <content type="text">{转义_文本(描述)}</content>
    <link rel="subsection" href={转义_属性(地址)} type={转义_属性(获取目录MIME)}/>
  </entry>
'''


def 生成_获取条目(行):
    """生成一条图书获取目录条目"""
    书籍_id = 行['id']
    书名 = 行['书名'] or f'图书 {书籍_id}'
    作者 = 行['作者']
    出版社 = 行['出版社']
    出版时间 = 格式化_出版时间(行['出版时间'])
    内容简介 = 行['内容简介']
    AI评估 = 行['ai评估']
    中图法 = 行['中图法']
    标签 = 行['标签']
    语言 = 行['文本语言']
    文件格式 = 规范化_文件格式(行['文件格式'] or 行['存储文件名'])
    MIME类型 = 获取_文件_MIME类型(文件格式)
    更新时间 = 格式化_时间戳(行['更新时间'] or 行['入库时间'])
    根地址 = 获取_站点根地址()
    下载文件名 = 生成_安全下载文件名(书名, 作者, 出版社, 文件格式, 行['存储文件名'])
    # 书籍 ID 放在独立路径段中，下载 URL 不再包含查询参数，避免阅读器把查询串拼进文件名
    下载地址 = (
        f'{根地址}/api/search-id/{书籍_id}/'
        f'{quote(下载文件名, safe="")}'
    )

    作者块 = f'    <author>\n      <name>{转义_文本(作者)}</name>\n    </author>\n' if 作者 else ''
    出版社块 = f'    <dcterms:publisher>{转义_文本(出版社)}</dcterms:publisher>\n' if 出版社 else ''
    出版时间块 = f'    <dcterms:issued type="date">{转义_文本(出版时间)}</dcterms:issued>\n' if 出版时间 else ''
    语言块 = f'    <dcterms:language>{转义_文本(语言)}</dcterms:language>\n' if 语言 else ''
    分类块 = ''
    if 中图法:
        分类块 += f'    <category term={转义_属性(中图法)} label={转义_属性(中图法)}/>\n'
    if 标签:
        分类块 += f'    <category term={转义_属性(标签)} label={转义_属性(标签)}/>\n'
    内容简介块 = f'【内容简介】\n{str(内容简介).strip()}' if 内容简介 and str(内容简介).strip() else ''
    AI评估块 = f'【AI 评估】\n{str(AI评估).strip()}' if AI评估 and str(AI评估).strip() else ''
    AI评估块 = 截断_摘要片段(AI评估块, 摘要最大长度)
    if 内容简介块:
        内容简介最大长度 = 摘要最大长度 - len(AI评估块) - (2 if AI评估块 else 0)
        内容简介块 = 截断_摘要片段(内容简介块, 内容简介最大长度)

    摘要部分列表 = [部分 for 部分 in (内容简介块, AI评估块) if 部分]
    摘要块 = ''
    if 摘要部分列表:
        摘要文本 = '\n\n'.join(摘要部分列表)
        摘要块 = f'    <summary type="text">{转义_文本(摘要文本)}</summary>\n'

    return f'''  <entry>
    <title>{转义_文本(书名)}</title>
    <id>{转义_文本(生成_条目_id(书籍_id))}</id>
    <updated>{转义_文本(更新时间)}</updated>
{作者块}    <link rel="http://opds-spec.org/acquisition" href={转义_属性(下载地址)} type={转义_属性(MIME类型)}/>
{出版社块}{出版时间块}{语言块}{分类块}{摘要块}  </entry>
'''


def 生成_分页地址(路径, 参数, 页码):
    """生成带分页参数与页码的地址"""
    参数 = dict(参数)
    参数['page'] = 页码
    return f'{路径}?{urlencode(参数)}'


def 生成_获取目录链接列表(路径, 请求参数, 页码, 总页数, 根地址):
    """生成获取目录的 self / start / first / previous / next / last 链接"""
    链接列表 = [
        ('self', 生成_分页地址(路径, 请求参数, 页码), 获取目录MIME),
        ('start', f'{根地址}/api/opds/root.xml', 导航目录MIME),
        ('first', 生成_分页地址(路径, 请求参数, 1), 获取目录MIME),
    ]
    链接列表.extend(生成_检索链接列表(根地址))
    if 页码 > 1:
        链接列表.append(('previous', 生成_分页地址(路径, 请求参数, 页码 - 1), 获取目录MIME))
    if 页码 < 总页数:
        链接列表.append(('next', 生成_分页地址(路径, 请求参数, 页码 + 1), 获取目录MIME))
    链接列表.append(('last', 生成_分页地址(路径, 请求参数, 总页数), 获取目录MIME))
    return 链接列表


def 生成_统计块(总数, 每页, 页码):
    """生成 OpenSearch 统计元素"""
    return (f'    <os:totalResults>{总数}</os:totalResults>\n'
            f'    <os:itemsPerPage>{每页}</os:itemsPerPage>\n'
            f'    <os:startIndex>{(页码 - 1) * 每页 + 1}</os:startIndex>\n')


def 查询_图书列表(where语句, 参数, 页码, 每页):
    """执行分页查询，返回 (总数, 行列表)"""
    计数语句 = f'SELECT COUNT(*) FROM 书籍 WHERE {where语句}'
    数据语句 = (f'SELECT {书籍查询字段} FROM 书籍 WHERE {where语句} '
                'ORDER BY id DESC LIMIT ? OFFSET ?')
    偏移 = (页码 - 1) * 每页
    with closing(获取_数据库连接()) as 连接:
        cursor = 连接.cursor()
        cursor.execute(计数语句, 参数)
        总数 = cursor.fetchone()[0]
        cursor.execute(数据语句, 参数 + [每页, 偏移])
        行列表 = cursor.fetchall()
        cursor.close()
    return 总数, 行列表


@api_bp.route('/opds/')
@api_bp.route('/opds/root.xml')
def opds_根目录():
    """OPDS 导航根目录"""
    根地址 = 获取_站点根地址()
    目录地址 = f'{根地址}/api/opds/root.xml'
    链接列表 = [
        ('self', 目录地址, 导航目录MIME),
        ('start', 目录地址, 导航目录MIME),
    ]
    链接列表.extend(生成_检索链接列表(根地址))
    条目块 = ''
    条目块 += 生成_导航条目('全部图书', f'{根地址}/api/opds/books', '浏览全部图书')
    条目块 += 生成_导航条目('EPUB 图书', f'{根地址}/api/opds/books?{urlencode({"格式": "EPUB"})}', '仅浏览 EPUB 格式的图书')
    条目块 += 生成_导航条目('PDF 图书', f'{根地址}/api/opds/books?{urlencode({"格式": "PDF"})}', '仅浏览 PDF 格式的图书')
    return 返回_提要(生成_提要(f'{站点名称} 目录', 目录地址, 链接列表, 条目块), 导航目录MIME)


@api_bp.route('/opds/books')
def opds_全部图书():
    """全部图书获取目录（支持分页与格式筛选）"""
    页码, 每页 = 获取_分页参数()
    格式 = 规范化_文件格式(request.args.get('格式') or request.args.get('format', ''))
    where语句 = "(存储状态 = ? OR COALESCE(TRIM(存储状态), '') = '')"
    参数 = ['正常']
    if 格式:
        where语句 += ' AND UPPER(文件格式) = ?'
        参数.append(格式)

    总数, 行列表 = 查询_图书列表(where语句, 参数, 页码, 每页)
    总页数 = max(1, (总数 + 每页 - 1) // 每页)

    根地址 = 获取_站点根地址()
    路径 = f'{根地址}/api/opds/books'
    请求参数 = {}
    if 格式:
        请求参数['格式'] = 格式

    链接列表 = 生成_获取目录链接列表(路径, 请求参数, 页码, 总页数, 根地址)
    统计块 = 生成_统计块(总数, 每页, 页码)
    标题 = f'{站点名称} - 全部图书' + (f'（{格式}）' if 格式 else '')
    条目块 = ''.join(生成_获取条目(行) for 行 in 行列表)
    return 返回_提要(
        生成_提要(标题, 生成_分页地址(路径, 请求参数, 页码), 链接列表, 条目块, 统计块),
        获取目录MIME
    )


@api_bp.route('/opds/search')
@api_bp.route('/opds/search/')
def opds_检索():
    """按书名 / 作者 / 出版社检索图书"""
    关键词 = ''
    for 参数名 in ('q', 'query', 'searchTerms'):
        参数值 = request.args.get(参数名, '').strip()
        if 参数值:
            关键词 = 参数值
            break
    页码, 每页 = 获取_分页参数()
    根地址 = 获取_站点根地址()
    路径 = f'{根地址}/api/opds/search'
    请求参数 = {}
    if 关键词:
        请求参数['q'] = 关键词

    if not 关键词:
        链接列表 = [
            ('self', 生成_分页地址(路径, 请求参数, 页码), 获取目录MIME),
            ('start', f'{根地址}/api/opds/root.xml', 导航目录MIME),
        ]
        链接列表.extend(生成_检索链接列表(根地址))
        统计块 = '    <os:totalResults>0</os:totalResults>\n    <os:itemsPerPage>0</os:itemsPerPage>\n    <os:startIndex>0</os:startIndex>\n'
        return 返回_提要(
            生成_提要(f'{站点名称} - 检索结果', 生成_分页地址(路径, 请求参数, 页码), 链接列表, '', 统计块),
            获取目录MIME
        )

    where语句 = ("(存储状态 = ? OR COALESCE(TRIM(存储状态), '') = '') "
                 "AND (书名 LIKE ? OR 作者 LIKE ? OR 出版社 LIKE ?)")
    参数 = ['正常', f'%{关键词}%', f'%{关键词}%', f'%{关键词}%']

    总数, 行列表 = 查询_图书列表(where语句, 参数, 页码, 每页)
    总页数 = max(1, (总数 + 每页 - 1) // 每页)

    链接列表 = 生成_获取目录链接列表(路径, 请求参数, 页码, 总页数, 根地址)
    统计块 = 生成_统计块(总数, 每页, 页码)
    标题 = f'{站点名称} - 检索：{关键词}'
    条目块 = ''.join(生成_获取条目(行) for 行 in 行列表)
    return 返回_提要(
        生成_提要(标题, 生成_分页地址(路径, 请求参数, 页码), 链接列表, 条目块, 统计块),
        获取目录MIME
    )


@api_bp.route('/opds/opensearch.xml')
def opds_检索描述():
    """OpenSearch 描述文档"""
    根地址 = 获取_站点根地址()
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="{OPENSEARCH命名空间}">
  <ShortName>{转义_文本(站点名称)}</ShortName>
  <Description>{转义_文本(f'{站点名称} OPDS 图书检索')}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url rel="results" type="{获取目录MIME}" template={转义_属性(f'{根地址}/api/opds/search?q={{searchTerms}}')}/>
</OpenSearchDescription>'''
    响应 = Response(xml)
    响应.headers['Content-Type'] = f'{OPENSEARCH_MIME}; charset=utf-8'
    return 响应

# -*- coding: utf-8 -*-
"""临时文件信息采集、数据库入库与归档接口

- POST /api/import-temp：处理临时文件夹中的所有 PDF、EPUB 文件。

单个文件的处理顺序为：读取基本信息、开启数据库写事务、检查 MD5、
分配存储位置并写入记录、移动文件、提交事务。移动失败时回滚数据库记录，
并将已经移动的文件移回临时文件夹。
"""
import errno
import hashlib
import os
import re
import shutil
import sqlite3
import time
from pathlib import Path

from flask import current_app, jsonify

from api import api_bp
from api.文件存储 import 获取_类型存储位置


支持格式 = {'PDF', 'EPUB'}
EPUB填充上限 = 129120
PDF起始目录编号 = 10000
PDF每目录容量 = 200
PDF编号目录模式 = re.compile(r'^\d+$')


def 获取_文件格式(文件路径):
    """根据扩展名返回 PDF 或 EPUB，其他格式返回空字符串"""
    扩展名 = Path(文件路径).suffix.lstrip('.').upper()
    return 扩展名 if 扩展名 in 支持格式 else ''


def 计算_MD5(文件路径):
    """分块读取文件，避免大文件占用过多内存"""
    MD5对象 = hashlib.md5()
    with open(文件路径, 'rb') as 文件:
        while True:
            数据块 = 文件.read(1024 * 1024)
            if not 数据块:
                break
            MD5对象.update(数据块)
    return MD5对象.hexdigest()


def 获取_文件基本信息(文件路径):
    """获取文件格式、完整文件名、体积和作为唯一标识的 MD5"""
    路径 = Path(文件路径)
    if not 路径.is_file():
        raise ValueError('文件不存在或不是普通文件')

    文件格式 = 获取_文件格式(路径)
    if not 文件格式:
        raise ValueError('仅支持 PDF 和 EPUB 文件')

    return {
        '路径': 路径,
        '格式': 文件格式,
        '书名': 路径.name,
        '体积': 路径.stat().st_size,
        'MD5': 计算_MD5(路径),
    }


def 获取_数据库连接():
    """创建可显式控制事务的数据库连接"""
    return sqlite3.connect(
        current_app.config['数据库地址'],
        timeout=30,
        isolation_level=None,
    )


def 查询_重复记录(连接, MD5值):
    """按 MD5 查询数据库中已有的图书"""
    return 连接.execute(
        'SELECT id, 存储位置, 存储文件名 FROM 书籍 WHERE md5 = ? LIMIT 1',
        (MD5值,),
    ).fetchone()


def 获取_EPUB缺失编号(连接):
    """返回 1 到 129120 中当前最小的缺失 ID，填满后返回 None"""
    已用编号 = {
        行[0]
        for 行 in 连接.execute(
            'SELECT id FROM 书籍 WHERE id BETWEEN 1 AND ?',
            (EPUB填充上限,),
        )
    }

    for 编号 in range(1, EPUB填充上限 + 1):
        if 编号 not in 已用编号:
            return 编号
    return None


def 统计_目录文件数(目录):
    """统计目录下一层普通文件数量"""
    return sum(
        1
        for 项目 in 目录.iterdir()
        if 项目.is_file() and not 项目.name.startswith('.')
    )


def 获取_PDF存储编号(类型目录):
    """检查最大编号目录；未满则复用，已满则返回下一个编号"""
    类型目录.mkdir(parents=True, exist_ok=True)
    已有编号 = [
        编号
        for 项目 in 类型目录.iterdir()
        if 项目.is_dir()
        if PDF编号目录模式.fullmatch(项目.name)
        if (编号 := int(项目.name)) >= PDF起始目录编号
    ]

    if not 已有编号:
        return PDF起始目录编号

    最大编号 = max(已有编号)
    最大编号目录 = 类型目录 / str(最大编号)
    if 统计_目录文件数(最大编号目录) < PDF每目录容量:
        return 最大编号
    return 最大编号 + 1


def 获取_不重复文件路径(目标目录, 文件名):
    """优先保留原始文件名，重名时追加序号避免覆盖"""
    文件路径 = 目标目录 / 文件名
    if not 文件路径.exists():
        return 文件路径

    主干, 扩展名 = os.path.splitext(文件名)
    序号 = 1
    while True:
        候选路径 = 目标目录 / f'{主干}_{序号}{扩展名}'
        if not 候选路径.exists():
            return 候选路径
        序号 += 1


def 准备_存储位置(连接, 文件信息):
    """分配数据库 ID、存储位置和目标文件路径"""
    存储根目录 = 获取_类型存储位置(文件信息['格式'])
    if not 存储根目录:
        raise ValueError(f"未配置 {文件信息['格式']} 的存储位置")
    类型目录 = Path(存储根目录)

    数据库ID = None

    if 文件信息['格式'] == 'EPUB':
        存储文件名 = f"{文件信息['MD5']}.epub"
        数据库ID = 获取_EPUB缺失编号(连接)
        MD5前缀 = 文件信息['MD5'][:2]
        存储位置 = f'12万/{MD5前缀}'
        目标目录 = 类型目录 / '12万' / MD5前缀
    else:
        存储文件名 = 文件信息['书名']
        编号 = 获取_PDF存储编号(类型目录)
        存储位置 = str(编号)
        目标目录 = 类型目录 / 存储位置

    目标目录.mkdir(parents=True, exist_ok=True)
    if 文件信息['格式'] == 'PDF':
        目标路径 = 获取_不重复文件路径(目标目录, 存储文件名)
    else:
        目标路径 = 目标目录 / 存储文件名
        if 目标路径.exists():
            raise FileExistsError(f'目标文件已存在: {目标路径}')

    return 数据库ID, 存储位置, 目标路径


def 插入_图书记录(连接, 文件信息, 数据库ID, 存储位置, 存储文件名):
    """写入图书基本信息；EPUB 优先使用指定的缺失 ID"""
    当前时间 = int(time.time())
    字段 = [
        '书名', '文件格式', '文件体积', 'md5', '存储文件名', '存储位置',
        '存储状态', '封面有无', '入库时间', '更新时间',
    ]
    值 = [
        文件信息['书名'],
        文件信息['格式'],
        文件信息['体积'],
        文件信息['MD5'],
        存储文件名,
        存储位置,
        '正常',
        0,
        当前时间,
        当前时间,
    ]

    if 数据库ID is None:
        占位符 = ', '.join('?' for _ in 字段)
        游标 = 连接.execute(
            f"INSERT INTO 书籍 ({', '.join(字段)}) VALUES ({占位符})",
            值,
        )
    else:
        字段.insert(0, 'id')
        值.insert(0, 数据库ID)
        占位符 = ', '.join('?' for _ in 字段)
        游标 = 连接.execute(
            f"INSERT INTO 书籍 ({', '.join(字段)}) VALUES ({占位符})",
            值,
        )

    return 游标.lastrowid


def 移动_文件(源路径, 目标路径):
    """优先使用原子重命名，跨文件系统时回退到复制后移动"""
    目标路径.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.replace(源路径, 目标路径)
    except OSError as 错误:
        if 错误.errno != errno.EXDEV:
            raise
        shutil.move(str(源路径), str(目标路径))


def 处理_单个文件(文件路径):
    """采集、入库并移动一个文件，返回可公开的处理结果"""
    源路径 = Path(文件路径)
    已移动 = False
    目标路径 = None
    连接 = None

    try:
        文件信息 = 获取_文件基本信息(源路径)
        连接 = 获取_数据库连接()
        连接.execute('BEGIN IMMEDIATE')

        重复记录 = 查询_重复记录(连接, 文件信息['MD5'])
        if 重复记录:
            连接.execute('ROLLBACK')
            return {
                '状态': '重复',
                '文件名': 文件信息['书名'],
                'MD5': 文件信息['MD5'],
                '已有ID': 重复记录[0],
                '已有存储位置': 重复记录[1],
                '已有存储文件名': 重复记录[2],
            }

        数据库ID, 存储位置, 目标路径 = 准备_存储位置(连接, 文件信息)
        新ID = 插入_图书记录(
            连接,
            文件信息,
            数据库ID,
            存储位置,
            目标路径.name,
        )
        移动_文件(源路径, 目标路径)
        已移动 = True
        连接.execute('COMMIT')

        return {
            '状态': '已入库',
            '文件名': 文件信息['书名'],
            'ID': 新ID,
            '格式': 文件信息['格式'],
            'MD5': 文件信息['MD5'],
            '存储位置': 存储位置,
            '存储文件名': 目标路径.name,
        }
    except Exception as 错误:
        if 连接 is not None:
            try:
                连接.execute('ROLLBACK')
            except sqlite3.Error:
                pass

        回滚错误 = None
        if 已移动 and 目标路径 is not None:
            try:
                移动_文件(目标路径, 源路径)
            except Exception as 移动错误:
                回滚错误 = str(移动错误)

        结果 = {
            '状态': '失败',
            '文件名': 源路径.name,
            '错误': str(错误),
        }
        if 回滚错误:
            结果['回滚错误'] = 回滚错误
        return 结果
    finally:
        if 连接 is not None:
            连接.close()


def 处理_临时文件列表(文件列表):
    """逐个处理临时文件，单个失败不影响其他文件"""
    return [处理_单个文件(文件路径) for 文件路径 in 文件列表]


def 处理_临时文件夹():
    """处理临时文件夹第一层中的所有普通文件"""
    临时文件夹 = Path(current_app.config.get('临时文件夹') or '')
    if not 临时文件夹.exists():
        return []
    if not 临时文件夹.is_dir():
        raise NotADirectoryError(f'临时文件夹路径不是目录: {临时文件夹}')

    文件列表 = sorted(
        项目
        for 项目 in 临时文件夹.iterdir()
        if 项目.is_file() and not 项目.name.startswith('.')
    )
    return 处理_临时文件列表(文件列表)


def 转换_公开结果(结果):
    """将内部处理结果转换为保持英文的 JSON 字段"""
    状态映射 = {
        '已入库': 'imported',
        '重复': 'duplicate',
        '失败': 'failed',
    }
    公开结果 = {
        'file_name': 结果.get('文件名'),
        'status': 状态映射.get(结果.get('状态'), 'failed'),
    }

    if 结果['状态'] == '已入库':
        公开结果.update({
            'book_id': 结果['ID'],
            'format': 结果['格式'],
            'md5': 结果['MD5'],
            'storage_location': 结果['存储位置'],
            'storage_file_name': 结果['存储文件名'],
        })
    elif 结果['状态'] == '重复':
        公开结果.update({
            'existing_book_id': 结果['已有ID'],
            'md5': 结果['MD5'],
            'existing_storage_location': 结果['已有存储位置'],
            'existing_storage_file_name': 结果['已有存储文件名'],
        })
    else:
        公开结果['error'] = 结果.get('错误', '未知错误')
        if 结果.get('回滚错误'):
            公开结果['rollback_error'] = 结果['回滚错误']

    return 公开结果


def 生成_处理摘要(结果列表):
    """汇总处理结果，便于接口返回和生成提示信息"""
    已入库 = [结果 for 结果 in 结果列表 if 结果.get('状态') == '已入库']
    重复 = [结果 for 结果 in 结果列表 if 结果.get('状态') == '重复']
    失败 = [结果 for 结果 in 结果列表 if 结果.get('状态') == '失败']

    return {
        'total': len(结果列表),
        'imported_count': len(已入库),
        'duplicate_count': len(重复),
        'failed_count': len(失败),
        'imported': [转换_公开结果(结果) for 结果 in 已入库],
        'duplicates': [转换_公开结果(结果) for 结果 in 重复],
        'failed': [转换_公开结果(结果) for 结果 in 失败],
    }


def 生成_处理消息(摘要):
    """根据汇总结果生成中文消息"""
    if 摘要['total'] == 0:
        return '临时文件夹中没有可处理的文件'

    消息部分 = []
    if 摘要['imported_count']:
        消息部分.append(f"成功入库 {摘要['imported_count']} 个文件")
    if 摘要['duplicate_count']:
        消息部分.append(f"发现 {摘要['duplicate_count']} 个重复文件")
    if 摘要['failed_count']:
        消息部分.append(f"{摘要['failed_count']} 个文件处理失败")
    return '，'.join(消息部分)


@api_bp.route('/import-temp', methods=['POST'])
def 导入_临时文件():
    """处理临时文件夹中的全部文件"""
    try:
        结果列表 = 处理_临时文件夹()
    except OSError as 错误:
        return jsonify({'success': False, 'error': str(错误)}), 500

    摘要 = 生成_处理摘要(结果列表)
    成功 = 摘要['failed_count'] == 0
    状态码 = 200 if 成功 else 500
    return jsonify({
        'success': 成功,
        'message': 生成_处理消息(摘要),
        'import': 摘要,
    }), 状态码

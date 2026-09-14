# -*- coding: utf-8 -*-
"""按文件类型解析存储目录与 MIME 类型的公共工具"""
import os
import re
from flask import current_app

# 文件格式 -> MIME 类型（以后加新格式只需在此补一行）
MIME类型映射 = {
    'EPUB': 'application/epub+zip',
    'PDF': 'application/pdf',
    'MOBI': 'application/x-mobipocket-ebook',
    'AZW3': 'application/vnd.amazon.ebook',
    'TXT': 'text/plain',
    'DOCX': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'DJVU': 'image/vnd.djvu',
    'CBZ': 'application/vnd.comicbook+zip',
}

# 跨平台文件名中不允许或容易引发兼容问题的字符
文件名禁止字符 = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
连续空白字符 = re.compile(r'\s+')
Windows保留文件名 = {
    'CON', 'PRN', 'AUX', 'NUL',
    *(f'COM{编号}' for 编号 in range(1, 10)),
    *(f'LPT{编号}' for 编号 in range(1, 10)),
}
文件名最大字节数 = 240


def 规范化_文件格式(文件格式):
    """统一大小写，兼容 'EPUB'、'pdf'、'.epub' 三种写法"""
    if not 文件格式:
        return ''
    格式 = os.path.splitext(文件格式)[1] or 文件格式
    return 格式.lstrip('.').strip().upper()


def 获取_类型存储位置(文件格式):
    """按文件格式返回对应目录；未配置时回退到任意已配置目录"""
    格式 = 规范化_文件格式(文件格式)
    类型存储位置 = current_app.config.get('类型存储位置') or {}
    if 格式 in 类型存储位置:
        return 类型存储位置[格式]
    return next(iter(类型存储位置.values()), '')


def 获取_文件_MIME类型(文件格式):
    格式 = 规范化_文件格式(文件格式)
    return MIME类型映射.get(格式, 'application/octet-stream')


def 清理_文件名部分(值):
    """清理文件名中的一个部分，保留可跨平台使用的普通字符"""
    if 值 is None:
        return ''
    文本 = 连续空白字符.sub(' ', str(值))
    文本 = 文件名禁止字符.sub('_', 文本)
    return 文本.strip(' ._')


def 截断_文件名(文本, 最大字节数):
    """按 UTF-8 字节数截断文本，避免生成超过文件系统限制的文件名"""
    if 最大字节数 <= 0:
        return ''
    编码 = 文本.encode('utf-8')
    if len(编码) <= 最大字节数:
        return 文本
    return 编码[:最大字节数].decode('utf-8', errors='ignore').rstrip(' ._')


def 生成_安全下载文件名(书名, 作者, 出版社, 文件格式, 原始文件名=''):
    """生成“书名_作者_出版社.扩展名”格式的跨平台安全下载文件名"""
    名称部分 = [
        清理_文件名部分(书名),
        清理_文件名部分(作者),
        清理_文件名部分(出版社),
    ]
    基础名 = '_'.join(部分 for 部分 in 名称部分 if 部分) or '未命名图书'

    格式 = 规范化_文件格式(文件格式)
    if re.fullmatch(r'[A-Za-z0-9]+', 格式):
        扩展名 = f'.{格式.lower()}'
    else:
        原始扩展名 = os.path.splitext(str(原始文件名 or ''))[1].lower()
        扩展名 = 原始扩展名 if re.fullmatch(r'\.[a-z0-9]{1,10}', 原始扩展名) else ''

    基础名 = 截断_文件名(基础名, 文件名最大字节数 - len(扩展名.encode('utf-8')))
    if 基础名.upper() in Windows保留文件名:
        基础名 = f'_{基础名}'
    基础名 = 基础名 or '未命名图书'
    return f'{基础名}{扩展名}'


def 拼接_文件路径(存储位置, 存储文件名, 文件格式):
    """目录按类型选择，兼容数据库中旧层级路径与磁盘上 md5 前两位目录布局

    数据库里的存储位置形如 "12万/33"，而磁盘实际布局是
    "<类型目录>/<文件名前两位>/<文件名>"（如 存档/epub/33/xxx.epub），
    因此依次尝试多个候选路径，返回第一个真实存在的文件；
    全部不存在时返回主候选路径，由调用方判断并提示"文件不存在"。
    """
    类型目录 = 获取_类型存储位置(文件格式)

    候选路径 = []
    if 存储位置:
        候选路径.append(os.path.join(类型目录, 存储位置, 存储文件名 or ''))
    else:
        候选路径.append(os.path.join(类型目录, 存储文件名 or ''))

    if 存储位置:
        # 旧库存储位置形如 "12万/33"，最后一层才是磁盘上的实际目录
        末段目录 = 存储位置.rstrip('/').split('/')[-1]
        if 末段目录 != 存储位置:
            候选路径.append(os.path.join(类型目录, 末段目录, 存储文件名 or ''))

    # 磁盘实际布局：<类型目录>/<文件名前两位（md5 前缀）>/<文件名>
    if 存储文件名 and len(存储文件名) >= 2:
        候选路径.append(os.path.join(类型目录, 存储文件名[:2], 存储文件名))

    for 路径 in 候选路径:
        if os.path.exists(路径):
            return 路径
    return 候选路径[0]

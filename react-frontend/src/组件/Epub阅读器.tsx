import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import JSZip from 'jszip';
import AI图书助手 from './AI图书助手';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

interface 电子书元数据 {
  标题?: string;
  作者?: string;
  描述?: string;
  出版社?: string;
  语言?: string;
  [键: string]: string | undefined;
}

interface 清单项 {
  标识: string;
  路径: string;
  媒体类型: string;
  属性: string;
  完整路径: string;
}

interface 目录项 {
  标识: string;
  链接: string;
  标题: string;
  子项?: 目录项[];
}

type 资源映射 = Map<string, string>;

const 获取_本地名称 = (元素: Element): string => {
  const 原始名称 = 元素.localName || 元素.tagName || '';
  return 原始名称.toLowerCase().split(':').pop() || '';
};

const 查找_元素 = (根节点: ParentNode, 名称: string): Element | null => {
  const 目标名称 = 名称.toLowerCase();
  return Array.from(根节点.querySelectorAll('*')).find(
    (元素) => 获取_本地名称(元素) === 目标名称
  ) || null;
};

const 获取_直接子元素 = (元素: Element, 名称?: string): Element[] => {
  const 子元素 = Array.from(元素.children);
  if (!名称) return 子元素;
  const 目标名称 = 名称.toLowerCase();
  return 子元素.filter((子元素) => 获取_本地名称(子元素) === 目标名称);
};

const 安全解码 = (文本: string): string => {
  try {
    return decodeURIComponent(文本);
  } catch {
    return 文本;
  }
};

const 是否为外部链接 = (链接: string): boolean => {
  const 去空格链接 = 链接.trim();
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(去空格链接);
};

interface 拆分后的链接 {
  路径: string;
  锚点: string;
}

const 拆分_链接 = (链接: string): 拆分后的链接 => {
  const 原始链接 = (链接 || '').trim();
  const 井号位置 = 原始链接.indexOf('#');
  const 锚点 = 井号位置 >= 0 ? 安全解码(原始链接.slice(井号位置 + 1)) : '';
  let 路径 = 井号位置 >= 0 ? 原始链接.slice(0, 井号位置) : 原始链接;
  const 问号位置 = 路径.indexOf('?');
  if (问号位置 >= 0) 路径 = 路径.slice(0, 问号位置);
  return { 路径: 安全解码(路径), 锚点 };
};

// 统一使用压缩包内部路径：处理相对路径、百分号编码和路径别名
const 规范化路径 = (路径: string): string => {
  const 原始路径 = 安全解码((路径 || '').trim()).replace(/\\/g, '/');
  if (!原始路径 || 是否为外部链接(原始路径)) return 原始路径;

  const 分段: string[] = [];
  for (const 部分 of 原始路径.split('/')) {
    if (!部分 || 部分 === '.') continue;
    if (部分 === '..') {
      分段.pop();
      continue;
    }
    分段.push(部分);
  }
  return 分段.join('/');
};

const 拼接_路径 = (基准文件路径: string, 相对路径: string): string => {
  if (!相对路径) return 规范化路径(基准文件路径);
  if (是否为外部链接(相对路径)) return 相对路径;
  if (相对路径.startsWith('/')) return 规范化路径(相对路径);

  const 清理后的相对路径 = 安全解码(相对路径).replace(/\\/g, '/');
  const 基准目录 = 基准文件路径.endsWith('/')
    ? 基准文件路径
    : 基准文件路径.slice(0, 基准文件路径.lastIndexOf('/') + 1);
  return 规范化路径(`${基准目录}${清理后的相对路径}`);
};

const 获取_路径键 = (路径: string): string => {
  return 规范化路径(路径).normalize('NFC').toLowerCase();
};

const 查找_压缩包文件 = (压缩包: JSZip, 期望路径: string) => {
  const 规范化后的路径 = 规范化路径(期望路径);
  if (!规范化后的路径 || 是否为外部链接(规范化后的路径)) return null;

  const 直接文件 = 压缩包.file(规范化后的路径);
  if (直接文件) return 直接文件;

  const 期望键 = 获取_路径键(规范化后的路径);
  const 实际路径 = Object.keys(压缩包.files).find(
    (路径) => 获取_路径键(路径) === 期望键
  );
  return 实际路径 ? 压缩包.file(实际路径) : null;
};

const 查找_实际路径 = (压缩包: JSZip, 期望路径: string): string => {
  const 规范化后的路径 = 规范化路径(期望路径);
  if (压缩包.file(规范化后的路径)) return 规范化后的路径;

  const 期望键 = 获取_路径键(规范化后的路径);
  return Object.keys(压缩包.files).find(
    (路径) => 获取_路径键(路径) === 期望键
  ) || '';
};

const 展开_关键自闭合标签 = (内容: string, 标签规则: string): string => {
  const 正则 = new RegExp(
    `<((?:[\\w.-]+:)?(?:${标签规则}))\\b([^>]*?)\\/\\s*>`,
    'gi'
  );
  return 内容.replace(正则, (_匹配, 标签: string, 属性: string) => `<${
    标签
  }${属性}></${标签}>`);
};

const 文档_有解析错误 = (文档: Document): boolean => {
  const 根节点名称 = (文档.documentElement?.nodeName || '').toLowerCase();
  return 根节点名称 === 'parsererror' || Boolean(文档.querySelector('parsererror'));
};

const 解析_OPF文档 = (内容: string): Document => {
  const 解析器 = new DOMParser();
  const XML文档 = 解析器.parseFromString(内容, 'application/xml');
  if (!文档_有解析错误(XML文档)) return XML文档;

  // 一些 EPUB 的 OPF 存在未闭合标签，先展开关键自闭合标签再交给 HTML 解析器恢复结构
  const 容错内容 = 展开_关键自闭合标签(
    内容,
    'item|itemref|meta|reference|rootfile'
  );
  return 解析器.parseFromString(容错内容, 'text/html');
};

const 解析_NCX文档 = (内容: string): Document => {
  const 解析器 = new DOMParser();
  const XML文档 = 解析器.parseFromString(内容, 'application/xml');
  if (!文档_有解析错误(XML文档)) return XML文档;
  const 容错内容 = 展开_关键自闭合标签(内容, 'meta|navPoint|content');
  return 解析器.parseFromString(容错内容, 'text/html');
};

const 解析_HTML文档 = (内容: string): Document => {
  return new DOMParser().parseFromString(内容, 'text/html');
};

const 获取_元素文本 = (元素: Element | null): string => {
  return (元素?.textContent || '').replace(/\s+/g, ' ').trim();
};

const 解析_元数据 = (OPF文档: Document): 电子书元数据 => {
  const 元数据: 电子书元数据 = {};
  const 元数据元素 = 查找_元素(OPF文档, 'metadata');
  if (!元数据元素) return 元数据;

  const 读取字段 = (名称: string): string => {
    return 获取_元素文本(查找_元素(元数据元素, 名称));
  };

  元数据.标题 = 读取字段('title');
  元数据.作者 = 读取字段('creator');
  元数据.描述 = 读取字段('description');
  元数据.出版社 = 读取字段('publisher');
  元数据.语言 = 读取字段('language');
  return 元数据;
};

const 解析_文件清单 = (OPF文档: Document, OPF路径: string): 清单项[] => {
  const 清单元素 = 查找_元素(OPF文档, 'manifest');
  if (!清单元素) return [];

  const 直接项目元素 = 获取_直接子元素(清单元素, 'item');
  const 项目元素 = 直接项目元素.length > 0
    ? 直接项目元素
    : Array.from(清单元素.querySelectorAll('*')).filter(
      (元素) => 获取_本地名称(元素) === 'item'
    );

  return 项目元素.map((元素) => {
    const 路径 = 元素.getAttribute('href') || '';
    const { 路径: 清理后的路径 } = 拆分_链接(路径);
    return {
      标识: 元素.getAttribute('id') || '',
      路径: 清理后的路径,
      媒体类型: 元素.getAttribute('media-type') || '',
      属性: 元素.getAttribute('properties') || '',
      完整路径: 拼接_路径(OPF路径, 清理后的路径)
    };
  }).filter((项目) => Boolean(项目.完整路径));
};

const 解析_章节顺序 = (OPF文档: Document, 文件清单: 清单项[]): string[] => {
  const 脊柱元素 = 查找_元素(OPF文档, 'spine');
  if (!脊柱元素) return [];

  const 清单映射 = new Map(文件清单.map((项目) => [项目.标识, 项目]));
  const 直接章节元素 = 获取_直接子元素(脊柱元素, 'itemref');
  const 章节元素 = 直接章节元素.length > 0
    ? 直接章节元素
    : Array.from(脊柱元素.querySelectorAll('*')).filter(
      (元素) => 获取_本地名称(元素) === 'itemref'
    );

  return 章节元素
    .map((元素) => 清单映射.get(元素.getAttribute('idref') || '')?.完整路径 || '')
    .filter(Boolean);
};

const 获取_脊柱目录标识 = (OPF文档: Document): string => {
  return 查找_元素(OPF文档, 'spine')?.getAttribute('toc') || '';
};

const 查找_指南目录项 = (
  OPF文档: Document,
  OPF路径: string,
  文件清单: 清单项[]
): 清单项 | undefined => {
  const 指南元素 = 查找_元素(OPF文档, 'guide');
  if (!指南元素) return undefined;

  const 目录引用 = 获取_直接子元素(指南元素, 'reference').find(
    (元素) => (元素.getAttribute('type') || '').toLowerCase() === 'toc'
  );
  const 链接 = 目录引用?.getAttribute('href') || '';
  if (!链接) return undefined;

  const { 路径 } = 拆分_链接(链接);
  const 完整路径键 = 获取_路径键(拼接_路径(OPF路径, 路径));
  return 文件清单.find((项目) => 获取_路径键(项目.完整路径) === 完整路径键);
};

const 查找_属性导航项 = (文件清单: 清单项[]): 清单项 | undefined => {
  return 文件清单.find((项目) => {
    const 属性列表 = 项目.属性.toLowerCase().split(/\s+/);
    return 属性列表.includes('nav');
  });
};

const 查找_显式导航项 = (
  OPF文档: Document,
  OPF路径: string,
  文件清单: 清单项[]
): 清单项 | undefined => {
  return 查找_属性导航项(文件清单)
    || 查找_指南目录项(OPF文档, OPF路径, 文件清单);
};

const 查找_NCX项 = (
  OPF文档: Document,
  OPF路径: string,
  文件清单: 清单项[]
): 清单项 | undefined => {
  const 脊柱目录标识 = 获取_脊柱目录标识(OPF文档);
  const 指定项目 = 脊柱目录标识
    ? 文件清单.find((项目) => 项目.标识 === 脊柱目录标识)
    : undefined;

  return 指定项目
    || 文件清单.find(
      (项目) => 项目.媒体类型.toLowerCase() === 'application/x-dtbncx+xml'
    )
    || 文件清单.find((项目) => 项目.完整路径.toLowerCase().endsWith('.ncx'))
    || 查找_指南目录项(OPF文档, OPF路径, 文件清单);
};

const 创建_空目录项 = (
  标识: string,
  链接: string,
  标题: string
): 目录项 => ({
  标识,
  链接,
  标题: 标题 || '未命名章节'
});

const 解析_导航列表 = (
  列表元素: Element,
  基准文件路径: string,
  生成标识: () => string
): 目录项[] => {
  const 目录项列表: 目录项[] = [];

  for (const 列表项 of 获取_直接子元素(列表元素, 'li')) {
    const 直接链接 = 获取_直接子元素(列表项, 'a')[0]
      || Array.from(列表项.querySelectorAll('a'))[0];

    let 标题 = 获取_元素文本(直接链接);
    if (!标题) {
      const 文字元素 = 获取_直接子元素(列表项).filter(
        (元素) => !['ol', 'ul'].includes(获取_本地名称(元素))
      );
      标题 = 文字元素.map(获取_元素文本).join(' ').trim();
    }

    const 原始链接 = 直接链接?.getAttribute('href') || '';
    const { 路径, 锚点 } = 拆分_链接(原始链接);
    const 完整路径 = 路径 ? 拼接_路径(基准文件路径, 路径) : '';
    const 链接 = `${完整路径}${锚点 ? `#${锚点}` : ''}`;
    const 项目 = 创建_空目录项(生成标识(), 链接, 标题);

    const 子列表 = 获取_直接子元素(列表项).find(
      (元素) => ['ol', 'ul'].includes(获取_本地名称(元素))
    );
    if (子列表) {
      const 子项 = 解析_导航列表(子列表, 基准文件路径, 生成标识);
      if (子项.length > 0) 项目.子项 = 子项;
    }

    if (项目.链接 || 项目.子项?.length) 目录项列表.push(项目);
  }

  return 目录项列表;
};

const 解析_NCX节点 = (
  节点: Element,
  基准文件路径: string,
  生成标识: () => string
): 目录项 | null => {
  const 标题元素 = 获取_直接子元素(节点, 'navlabel')
    .flatMap((标签元素) => 获取_直接子元素(标签元素, 'text'))[0]
    || 查找_元素(节点, 'text');
  const 内容元素 = 获取_直接子元素(节点, 'content')[0]
    || 查找_元素(节点, 'content');
  const 原始链接 = 内容元素?.getAttribute('src') || '';
  const { 路径, 锚点 } = 拆分_链接(原始链接);
  const 完整路径 = 路径 ? 拼接_路径(基准文件路径, 路径) : '';

  const 项目 = 创建_空目录项(
    节点.getAttribute('id') || 生成标识(),
    `${完整路径}${锚点 ? `#${锚点}` : ''}`,
    获取_元素文本(标题元素)
  );

  const 子项 = 获取_直接子元素(节点, 'navpoint')
    .map((子节点) => 解析_NCX节点(子节点, 基准文件路径, 生成标识))
    .filter((子目录项): 子目录项 is 目录项 => Boolean(子目录项));
  if (子项.length > 0) 项目.子项 = 子项;

  return 项目.链接 || 项目.子项?.length ? 项目 : null;
};

const 统计_目录节点数 = (目录: 目录项[]): number => {
  return 目录.reduce(
    (总数, 项目) => 总数 + 1 + 统计_目录节点数(项目.子项 || []),
    0
  );
};

const 是否_页码或注释标签 = (文本: string): boolean => {
  const 紧凑文本 = 文本.replace(/\s+/g, '');
  if (!紧凑文本) return true;
  return /^(?:[〔【［\[(（]?\d+[〕】］\])）]?|第?\d+页?)$/.test(紧凑文本);
};

const 解析_普通目录链接 = (
  链接列表: Element[],
  基准文件路径: string,
  生成标识: () => string
): 目录项[] => {
  return 链接列表
    .filter((链接元素) => Boolean(链接元素.getAttribute('href')))
    .map((链接元素) => {
      const 原始链接 = 链接元素.getAttribute('href') || '';
      const { 路径, 锚点 } = 拆分_链接(原始链接);
      const 完整路径 = 路径 ? 拼接_路径(基准文件路径, 路径) : '';
      return 创建_空目录项(
        生成标识(),
        `${完整路径}${锚点 ? `#${锚点}` : ''}`,
        获取_元素文本(链接元素)
      );
    })
    .filter((项目) => Boolean(项目.链接) && !是否_页码或注释标签(项目.标题));
};

const 解析_HTML导航文件 = async (
  压缩包: JSZip,
  导航项目: 清单项,
  允许无类型导航: boolean
): Promise<目录项[]> => {
  const 导航文件 = 查找_压缩包文件(压缩包, 导航项目.完整路径);
  if (!导航文件) return [];

  try {
    const 内容 = await 导航文件.async('string');
    const 文档 = 解析_HTML文档(内容);
    let 序号 = 0;
    const 生成标识 = () => `nav-${导航项目.标识 || 'toc'}-${序号++}`;
    const 导航元素列表 = Array.from(文档.querySelectorAll('nav'));
    const 导航元素 = 导航元素列表.find((元素) => {
      const 类型 = (元素.getAttribute('epub:type') || '').toLowerCase();
      const 角色 = (元素.getAttribute('role') || '').toLowerCase();
      const 标识与类名 = `${元素.id} ${元素.className}`.toLowerCase();
      return /(^|\s)toc(\s|$)/.test(类型)
        || 角色 === 'doc-toc'
        || /(^|[\s_-])toc($|[\s_-])/.test(标识与类名);
    }) || (允许无类型导航 ? 导航元素列表[0] : undefined);

    if (!导航元素) {
      if (!允许无类型导航) return [];
      const 普通链接列表 = Array.from(文档.querySelectorAll('a[href]'));
      return 解析_普通目录链接(普通链接列表, 导航项目.完整路径, 生成标识);
    }

    const 主列表 = Array.from(导航元素.querySelectorAll('ol, ul'))[0];
    if (主列表) {
      return 解析_导航列表(主列表, 导航项目.完整路径, 生成标识);
    }

    return 解析_普通目录链接(
      Array.from(导航元素.querySelectorAll('a[href]')),
      导航项目.完整路径,
      生成标识
    );
  } catch (错误) {
    console.warn('解析 HTML 目录失败:', 错误);
    return [];
  }
};

const 获取_目录最大深度 = (目录: 目录项[], 当前深度: number = 0): number => {
  if (目录.length === 0) return 当前深度;
  return Math.max(...目录.map(
    (项目) => 获取_目录最大深度(项目.子项 || [], 当前深度 + 1)
  ));
};

const 获取_目录路径序列 = (目录: 目录项[]): string[] => {
  return 目录.flatMap((项目) => [
    ...(项目.链接 ? [项目.链接] : []),
    ...获取_目录路径序列(项目.子项 || [])
  ]);
};

const 是否_前置页面标题 = (标题: string): boolean => {
  const 紧凑标题 = 标题.replace(/\s+/g, '').toLowerCase();
  return /^(?:封面|封面页|扉页|书名页|版权页?|版权信息|目录|目次|contents?)$/.test(紧凑标题);
};

const 查找_首个正文链接 = (目录: 目录项[]): string => {
  for (const 项目 of 目录) {
    const { 路径 } = 拆分_链接(项目.链接);
    if (路径 && !是否_前置页面标题(项目.标题)) return 项目.链接;

    const 子项链接 = 查找_首个正文链接(项目.子项 || []);
    if (子项链接) return 子项链接;
  }
  return '';
};

const 获取_目录跳转链接 = (项目: 目录项): string => {
  return 查找_首个正文链接(项目.子项 || []) || 项目.链接;
};

const 目录顺序符合正文章节 = (
  目录: 目录项[],
  章节顺序: string[]
): boolean => {
  const 章节位置映射 = new Map<string, number>();
  章节顺序.forEach((路径, 索引) => {
    const 路径键 = 获取_路径键(路径);
    if (!章节位置映射.has(路径键)) 章节位置映射.set(路径键, 索引);
  });

  let 上次位置 = -1;
  for (const 链接 of 获取_目录路径序列(目录)) {
    const { 路径 } = 拆分_链接(链接);
    if (!路径) continue;
    const 当前位置 = 章节位置映射.get(获取_路径键(路径));
    if (当前位置 === undefined) continue;
    if (当前位置 < 上次位置) return false;
    上次位置 = 当前位置;
  }
  return true;
};

const 构建_扁平合集目录 = (目录: 目录项[]): 目录项[] => {
  const 是否已分层 = 目录.some((项目) => (项目.子项?.length || 0) > 0);
  if (目录.length < 20 || 是否已分层) return 目录;

  const 版权位置 = 目录
    .map((项目, 索引) => ({ 项目, 索引 }))
    .filter(({ 项目 }) => 项目.标题.replace(/\s+/g, '') === '版权信息')
    .map(({ 索引 }) => 索引);
  if (版权位置.length < 2) return 目录;

  const 书籍起点 = 版权位置
    .map((索引) => 索引 - 1)
    .filter((索引) => 索引 >= 0 && 目录[索引]?.链接);
  const 去重起点 = 书籍起点.filter((索引, 当前索引) => 书籍起点.indexOf(索引) === 当前索引);
  if (去重起点.length < 2) return 目录;

  const 前置项目 = 去重起点[0] > 0 ? 目录.slice(0, 去重起点[0]) : [];
  const 书籍目录 = 去重起点.map((起点, 索引) => {
    const 结束位置 = 去重起点[索引 + 1] ?? 目录.length;
    return {
      ...目录[起点],
      子项: 目录.slice(起点 + 1, 结束位置)
    };
  });

  return [...前置项目, ...书籍目录];
};

const 读取_子目录节点 = async (
  压缩包: JSZip,
  候选章节路径: string[],
  允许章节键: Set<string>
): Promise<目录项[]> => {
  let 最佳节点: 目录项[] = [];
  let 最佳得分 = 0;

  for (const 目录页路径 of 候选章节路径) {
    const 目录页文件 = 查找_压缩包文件(压缩包, 目录页路径);
    if (!目录页文件) continue;

    try {
      const 内容 = await 目录页文件.async('string');
      const 文档 = 解析_HTML文档(内容);
      const 链接元素列表 = Array.from(文档.querySelectorAll('a[href]')).filter((链接元素) => {
        const { 路径 } = 拆分_链接(链接元素.getAttribute('href') || '');
        if (!路径) return false;
        return 允许章节键.has(获取_路径键(拼接_路径(目录页路径, 路径)));
      });

      let 序号 = 0;
      const 节点 = 解析_普通目录链接(
        链接元素列表,
        目录页路径,
        () => `正文目录-${获取_路径键(目录页路径)}-${序号++}`
      );
      const 章节标签数 = 节点.filter(
        (项目) => !是否_页码或注释标签(项目.标题)
      ).length;

      const 目录语义元素 = Array.from(文档.querySelectorAll('[id], [class]')).some((元素) => {
        const 语义文本 = `${元素.id} ${元素.className}`.toLowerCase();
        return /(?:^|[\s_-])(?:toc|mulu|contents?)(?:$|[\s_-])/.test(语义文本);
      });
      const 标题文本 = [
        获取_元素文本(文档.querySelector('title')),
        获取_元素文本(文档.querySelector('h1')),
        获取_元素文本(文档.querySelector('h2')),
        获取_元素文本(文档.querySelector('.mulu'))
      ].join(' ').toLowerCase();
      const 是目录页 = 目录语义元素
        || 标题文本.includes('目录')
        || 标题文本.includes('contents');
      const 得分 = 章节标签数 * 10 + (是目录页 ? 100 : 0);

      if (章节标签数 >= 2 && 得分 > 最佳得分) {
        最佳节点 = 节点.filter((项目) => !是否_页码或注释标签(项目.标题));
        最佳得分 = 得分;
      }
    } catch (错误) {
      console.warn(`读取子目录失败: ${目录页路径}`, 错误);
    }
  }

  return 最佳节点;
};

const 提取_章节标题 = async (
  压缩包: JSZip,
  章节路径: string,
  回退标题: string
): Promise<string> => {
  const 章节文件 = 查找_压缩包文件(压缩包, 章节路径);
  if (!章节文件) return 回退标题;

  try {
    const 内容 = await 章节文件.async('string');
    const 文档 = 解析_HTML文档(内容);
    for (const 元素 of Array.from(文档.querySelectorAll('h1, h2, h3, h4'))) {
      const 标题 = 获取_元素文本(元素);
      if (标题) return 标题;
    }

    // Calibre 转换的合集常把章节标题放在普通段落或加粗 span 中
    const 段落标题 = Array.from(文档.querySelectorAll('p'))
      .map((元素) => 获取_元素文本(元素))
      .find((文本) => 文本.length >= 2 && 文本.length <= 80);
    if (段落标题) return 段落标题;

    const 文档标题 = 获取_元素文本(文档.querySelector('title'));
    if (文档标题) return 文档标题;
  } catch (错误) {
    console.warn(`无法读取章节标题: ${章节路径}`, 错误);
  }
  return 回退标题;
};

const 生成_缺失章节节点 = async (
  压缩包: JSZip,
  缺失章节路径: string[]
): Promise<目录项[]> => {
  const 结果: 目录项[] = new Array(缺失章节路径.length);
  const 并发数 = 12;

  for (let 起点 = 0; 起点 < 缺失章节路径.length; 起点 += 并发数) {
    const 当前批次 = 缺失章节路径.slice(起点, 起点 + 并发数);
    await Promise.all(当前批次.map(async (章节路径, 批次索引) => {
      const 实际索引 = 起点 + 批次索引;
      const 标题 = await 提取_章节标题(压缩包, 章节路径, `第 ${实际索引 + 1} 节`);
      结果[实际索引] = 创建_空目录项(
        `spine-${实际索引}-${获取_路径键(章节路径)}`,
        章节路径,
        标题
      );
    }));
  }

  return 结果;
};

const 补全_合集目录 = async (
  目录: 目录项[],
  章节顺序: string[],
  压缩包: JSZip
): Promise<目录项[]> => {
  const 是否浅层合集 = 目录.length >= 2
    && 章节顺序.length >= 20
    && 章节顺序.length > 目录.length * 3
    && 获取_目录最大深度(目录) <= 1;
  if (!是否浅层合集) return 目录;

  const 已有路径键 = new Set<string>();
  const 收集路径键 = (项目列表: 目录项[]) => {
    项目列表.forEach((项目) => {
      const { 路径 } = 拆分_链接(项目.链接);
      if (路径) 已有路径键.add(获取_路径键(路径));
      if (项目.子项) 收集路径键(项目.子项);
    });
  };
  收集路径键(目录);

  const 章节位置映射 = new Map<string, number>();
  章节顺序.forEach((路径, 索引) => {
    const 路径键 = 获取_路径键(路径);
    if (!章节位置映射.has(路径键)) 章节位置映射.set(路径键, 索引);
  });

  const 顶层位置列表 = 目录.map((项目) => {
    const { 路径 } = 拆分_链接(项目.链接);
    return 路径 ? 章节位置映射.get(获取_路径键(路径)) : undefined;
  });

  const 完整目录 = 目录.map((项目) => ({ ...项目, 子项: [...(项目.子项 || [])] }));

  for (let 索引 = 0; 索引 < 完整目录.length; 索引 += 1) {
    const 当前位置 = 顶层位置列表[索引];
    if (当前位置 === undefined) continue;

    const 后续位置 = 顶层位置列表.slice(索引 + 1).find((位置) => 位置 !== undefined);
    const 结束位置 = 后续位置 ?? 章节顺序.length;
    const 当前范围路径 = 章节顺序.slice(当前位置, 结束位置);
    const 允许章节键 = new Set(当前范围路径.map(获取_路径键));
    const 正文子目录 = await 读取_子目录节点(压缩包, 当前范围路径, 允许章节键);
    if (正文子目录.length >= 2) {
      完整目录[索引].子项 = 正文子目录;
      正文子目录.forEach((项目) => 已有路径键.add(获取_路径键(项目.链接)));
      continue;
    }

    const 缺失路径 = 章节顺序
      .slice(当前位置 + 1, 结束位置)
      .filter((路径) => !已有路径键.has(获取_路径键(路径)));
    if (缺失路径.length === 0) continue;

    const 缺失节点 = await 生成_缺失章节节点(压缩包, 缺失路径);
    完整目录[索引].子项 = [...(完整目录[索引].子项 || []), ...缺失节点];
    缺失节点.forEach((项目) => 已有路径键.add(获取_路径键(项目.链接)));
  }

  return 完整目录;
};

const 解析_全部目录 = async (
  压缩包: JSZip,
  OPF文档: Document,
  OPF路径: string,
  文件清单: 清单项[],
  章节顺序: string[]
): Promise<目录项[]> => {
  let HTML目录: 目录项[] = [];
  const 属性导航项 = 查找_属性导航项(文件清单);
  const 指南目录项 = 查找_指南目录项(OPF文档, OPF路径, 文件清单);
  const 显式导航项 = 属性导航项 || 指南目录项;
  if (显式导航项) {
    HTML目录 = await 解析_HTML导航文件(压缩包, 显式导航项, true);
  } else {
    const 候选导航项列表 = 文件清单.filter((项目) => {
      const 类型 = 项目.媒体类型.toLowerCase();
      return 类型 === 'application/xhtml+xml'
        || 类型 === 'text/html'
        || /\.x?html?$/i.test(项目.完整路径);
    });

    for (const 候选导航项 of 候选导航项列表) {
      HTML目录 = await 解析_HTML导航文件(压缩包, 候选导航项, false);
      if (HTML目录.length > 0) break;
    }
  }

  let NCX目录: 目录项[] = [];
  const NCX项目 = 查找_NCX项(OPF文档, OPF路径, 文件清单);
  if (NCX项目) {
    const NCX文件 = 查找_压缩包文件(压缩包, NCX项目.完整路径);
    if (NCX文件) {
      try {
        const 内容 = await NCX文件.async('string');
        const NCX文档 = 解析_NCX文档(内容);
        const 导航地图 = 查找_元素(NCX文档, 'navmap');
        if (导航地图) {
          let 序号 = 0;
          const 生成标识 = () => `ncx-${NCX项目.标识 || 'toc'}-${序号++}`;
          NCX目录 = 获取_直接子元素(导航地图, 'navpoint')
            .map((节点) => 解析_NCX节点(节点, NCX项目.完整路径, 生成标识))
            .filter((项目): 项目 is 目录项 => Boolean(项目));
        }
      } catch (错误) {
        console.warn('解析 NCX 目录失败:', 错误);
      }
    }
  }

  const NCX顺序正常 = 目录顺序符合正文章节(NCX目录, 章节顺序);
  const HTML顺序正常 = 目录顺序符合正文章节(HTML目录, 章节顺序);
  const HTML有效标签数 = HTML目录.filter(
    (项目) => !是否_页码或注释标签(项目.标题)
  ).length;
  const HTML标签有效率 = HTML目录.length > 0
    ? HTML有效标签数 / HTML目录.length
    : 0;
  const NCX节点数 = 统计_目录节点数(NCX目录);
  const HTML节点数 = 统计_目录节点数(HTML目录);
  const NCX目录更完整 = NCX顺序正常 && NCX节点数 > HTML节点数;
  const 指南HTML可信 = HTML目录.length > 0
    && HTML顺序正常
    && HTML目录.length <= Math.max(30, 章节顺序.length * 2)
    && HTML标签有效率 >= 0.8;

  let 选定目录: 目录项[];
  if (属性导航项) {
    选定目录 = HTML目录.length > 0 && !NCX目录更完整 ? HTML目录 : NCX目录;
  } else if (指南目录项) {
    选定目录 = 指南HTML可信 && !NCX目录更完整
      ? HTML目录
      : NCX目录.length > 0
        ? NCX目录
        : HTML目录;
  } else {
    选定目录 = NCX节点数 > HTML节点数
      ? NCX目录
      : HTML目录;
  }
  const 分层目录 = 构建_扁平合集目录(选定目录);
  return 补全_合集目录(分层目录, 章节顺序, 压缩包);
};

const 获取_资源类型 = (项目: 清单项): string => {
  if (项目.媒体类型) return 项目.媒体类型;
  const 路径 = 项目.完整路径.toLowerCase();
  const 类型映射: Array<[string, string]> = [
    ['.css', 'text/css'],
    ['.js', 'text/javascript'],
    ['.svg', 'image/svg+xml'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.gif', 'image/gif'],
    ['.webp', 'image/webp'],
    ['.woff2', 'font/woff2'],
    ['.woff', 'font/woff'],
    ['.ttf', 'font/ttf'],
    ['.otf', 'font/otf'],
    ['.xhtml', 'application/xhtml+xml'],
    ['.html', 'text/html']
  ];
  return 类型映射.find(([后缀]) => 路径.endsWith(后缀))?.[1] || 'application/octet-stream';
};

const 创建_资源映射 = async (
  压缩包: JSZip,
  文件清单: 清单项[]
): Promise<资源映射> => {
  const 映射: 资源映射 = new Map();
  for (const 项目 of 文件清单) {
    try {
      const 文件 = 查找_压缩包文件(压缩包, 项目.完整路径);
      if (!文件) continue;
      const 原始块 = await 文件.async('blob');
      const 类型 = 获取_资源类型(项目);
      const 资源块 = 原始块.type ? 原始块 : new Blob([原始块], { type: 类型 });
      const 地址 = URL.createObjectURL(资源块);
      映射.set(获取_路径键(项目.完整路径), 地址);
    } catch (错误) {
      console.warn(`无法创建资源映射: ${项目.路径}`, 错误);
    }
  }
  return 映射;
};

const 提取_正文结构 = (文档: Document): string => {
  const 正文元素 = 文档.body;
  if (!正文元素) return 文档.documentElement?.outerHTML || '';

  const 正文容器 = 文档.createElement('div');
  Array.from(正文元素.attributes).forEach((属性) => {
    正文容器.setAttribute(属性.name, 属性.value);
  });
  正文容器.setAttribute('data-epub-body', 'true');

  while (正文元素.firstChild) {
    正文容器.appendChild(正文元素.firstChild);
  }

  const 头部样式 = 文档.head
    ? Array.from(文档.head.children).filter((元素) => {
      const 名称 = 获取_本地名称(元素);
      if (名称 === 'style') return true;
      return 名称 === 'link'
        && /(?:^|\s)stylesheet(?:\s|$)/i.test(元素.getAttribute('rel') || '');
    })
    : [];

  return `${头部样式.map((元素) => 元素.outerHTML).join('')}${正文容器.outerHTML}`;
};

const 处理_HTML内容 = (
  HTML内容: string,
  章节路径: string,
  资源映射: 资源映射,
  章节路径集合: Set<string>
): string => {
  const 文档 = 解析_HTML文档(HTML内容);

  const 获取资源地址 = (原始地址: string): string | null => {
    if (!原始地址 || 是否为外部链接(原始地址) || 原始地址.startsWith('data:')) return null;
    const { 路径 } = 拆分_链接(原始地址);
    if (!路径) return null;
    const 完整路径 = 拼接_路径(章节路径, 路径);
    return 资源映射.get(获取_路径键(完整路径)) || null;
  };

  文档.querySelectorAll('img[src]').forEach((图像) => {
    const 原始地址 = 图像.getAttribute('src') || '';
    const 地址 = 获取资源地址(原始地址);
    if (地址) 图像.setAttribute('src', 地址);
  });

  文档.querySelectorAll('image').forEach((图像) => {
    const 原始地址 = 图像.getAttribute('href') || 图像.getAttribute('xlink:href') || '';
    const 地址 = 获取资源地址(原始地址);
    if (地址) {
      图像.setAttribute('href', 地址);
      图像.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', 地址);
    }
  });

  文档.querySelectorAll('link[rel~="stylesheet"][href]').forEach((链接) => {
    const 原始地址 = 链接.getAttribute('href') || '';
    const 地址 = 获取资源地址(原始地址);
    if (地址) 链接.setAttribute('href', 地址);
  });

  文档.querySelectorAll('script[src]').forEach((脚本) => {
    const 原始地址 = 脚本.getAttribute('src') || '';
    const 地址 = 获取资源地址(原始地址);
    if (地址) 脚本.setAttribute('src', 地址);
  });

  文档.querySelectorAll('a[href]').forEach((链接) => {
    const 原始链接 = 链接.getAttribute('href') || '';
    if (!原始链接 || 是否为外部链接(原始链接)) {
      if (原始链接 && !原始链接.startsWith('#')) {
        链接.setAttribute('target', '_blank');
        链接.setAttribute('rel', 'noopener noreferrer');
      }
      return;
    }

    const { 路径, 锚点 } = 拆分_链接(原始链接);
    const 目标路径 = 路径 ? 拼接_路径(章节路径, 路径) : 章节路径;
    const 目标键 = 获取_路径键(目标路径);
    const 是章节链接 = 章节路径集合.has(目标键) || /\.x?html?$/i.test(路径);

    if (是章节链接) {
      链接.setAttribute('href', '#');
      链接.setAttribute('data-epub-path', 目标路径);
      if (锚点) 链接.setAttribute('data-epub-fragment', 锚点);
      链接.removeAttribute('target');
      链接.classList.add('epub-internal-link');
      return;
    }

    const 资源地址 = 资源映射.get(目标键);
    if (资源地址) 链接.setAttribute('href', 资源地址);
  });

  return 提取_正文结构(文档);
};

interface 目录节点列表属性 {
  项目列表: 目录项[];
  当前章节键: string;
  层级: number;
  选择目录: (链接: string) => void;
}

const 目录节点列表: React.FC<目录节点列表属性> = ({
  项目列表,
  当前章节键,
  层级,
  选择目录
}) => {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 层级 === 0 ? 0 : '4px 0 0' }}>
      {项目列表.map((项目, 索引) => {
        const 跳转链接 = 获取_目录跳转链接(项目);
        const { 路径 } = 拆分_链接(跳转链接);
        const 是否当前章节 = Boolean(路径) && 获取_路径键(路径) === 当前章节键;
        return (
          <li key={项目.标识 || `${层级}-${索引}`}>
            <button
              onClick={() => 选择目录(跳转链接)}
              title={项目.标题}
              disabled={!跳转链接}
              aria-current={是否当前章节 ? 'page' : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: `7px 6px 7px ${6 + 层级 * 13}px`,
                background: 是否当前章节 ? '#e3eef9' : 'transparent',
                border: 'none',
                cursor: 跳转链接 ? 'pointer' : 'default',
                color: 是否当前章节 ? '#1a73e8' : '#555',
                fontWeight: 是否当前章节 ? 600 : 400,
                borderRadius: '3px',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(事件) => {
                if (!是否当前章节 && 跳转链接) 事件.currentTarget.style.backgroundColor = '#eee';
              }}
              onMouseOut={(事件) => {
                if (!是否当前章节) 事件.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {项目.标题}
            </button>

            {项目.子项 && 项目.子项.length > 0 && (
              <目录节点列表
                项目列表={项目.子项}
                当前章节键={当前章节键}
                层级={层级 + 1}
                选择目录={选择目录}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};

const Epub阅读器: React.FC = () => {
  const { bookID } = useParams<{ bookID: string }>();
  const [正在加载, 设置正在加载] = useState<boolean>(true);
  const [错误信息, 设置错误信息] = useState<string | null>(null);
  const [元数据, 设置元数据] = useState<电子书元数据>({});
  const [目录, 设置目录] = useState<目录项[]>([]);
  const [章节内容, 设置章节内容] = useState<string>('');
  const [当前章节路径, 设置当前章节路径] = useState<string>('');
  const [字号, 设置字号] = useState<number>(100);
  const [待定位锚点, 设置待定位锚点] = useState<string>('');
  const [定位版本, 设置定位版本] = useState<number>(0);

  const 阅读区引用 = useRef<HTMLDivElement>(null);
  const 压缩包引用 = useRef<JSZip | null>(null);
  const 章节路径引用 = useRef<string[]>([]);
  const 资源映射引用 = useRef<资源映射>(new Map());
  const 资源地址引用 = useRef<string[]>([]);
  const 加载轮次引用 = useRef(0);

  const 释放_资源地址 = useCallback(() => {
    资源地址引用.current.forEach((地址) => URL.revokeObjectURL(地址));
    资源地址引用.current = [];
    资源映射引用.current = new Map();
  }, []);

  const 查找_可用章节路径 = useCallback((目标路径: string): string => {
    const 目标键 = 获取_路径键(目标路径);
    const 章节列表 = 章节路径引用.current;
    return 章节列表.find((路径) => 获取_路径键(路径) === 目标键)
      || 章节列表.find((路径) => 获取_路径键(路径).endsWith(`/${目标键}`))
      || 章节列表.find((路径) => 获取_路径键(路径).split('/').pop() === 目标键.split('/').pop())
      || '';
  }, []);

  const 加载_章节内容 = useCallback(async (
    目标路径: string,
    锚点: string = ''
  ): Promise<boolean> => {
    const 压缩包 = 压缩包引用.current;
    const 实际章节路径 = 查找_可用章节路径(目标路径);
    if (!压缩包 || !实际章节路径) return false;

    try {
      const 章节文件 = 查找_压缩包文件(压缩包, 实际章节路径);
      if (!章节文件) throw new Error(`无法找到章节文件: ${实际章节路径}`);

      const 原始内容 = await 章节文件.async('string');
      const 章节键集合 = new Set(章节路径引用.current.map(获取_路径键));
      const 处理后内容 = 处理_HTML内容(
        原始内容,
        实际章节路径,
        资源映射引用.current,
        章节键集合
      );

      设置章节内容(处理后内容);
      设置当前章节路径(实际章节路径);
      设置待定位锚点(锚点);
      设置定位版本((版本) => 版本 + 1);
      return true;
    } catch (错误) {
      console.error('加载章节内容失败:', 错误);
      设置章节内容('<p>无法加载章节内容</p>');
      return false;
    }
  }, [查找_可用章节路径]);

  const 跳转_章节 = useCallback(async (链接: string) => {
    const { 路径, 锚点 } = 拆分_链接(链接);
    const 目标路径 = 路径 ? 查找_可用章节路径(路径) : 当前章节路径;
    if (!目标路径) return;

    if (获取_路径键(目标路径) === 获取_路径键(当前章节路径)) {
      设置待定位锚点(锚点);
      设置定位版本((版本) => 版本 + 1);
      return;
    }

    await 加载_章节内容(目标路径, 锚点);
  }, [当前章节路径, 加载_章节内容, 查找_可用章节路径]);

  const 加载_EPUB = useCallback(async () => {
    if (!bookID) {
      设置错误信息('未提供书籍ID');
      设置正在加载(false);
      return;
    }

    const 当前轮次 = ++加载轮次引用.current;
    释放_资源地址();
    设置正在加载(true);
    设置错误信息(null);
    设置目录([]);
    设置章节内容('');
    设置当前章节路径('');
    设置待定位锚点('');
    压缩包引用.current = null;
    章节路径引用.current = [];

    try {
      const 响应 = await fetch(`${API_BASE}/search-id?bookID=${bookID}`);
      if (!响应.ok) {
        throw new Error(`获取 EPUB 文件失败: ${响应.status} ${响应.statusText}`);
      }

      const 文件数据 = await 响应.arrayBuffer();
      if (当前轮次 !== 加载轮次引用.current) return;

      const 压缩包 = await JSZip.loadAsync(文件数据);
      if (当前轮次 !== 加载轮次引用.current) return;
      压缩包引用.current = 压缩包;

      const 容器文件 = 查找_压缩包文件(压缩包, 'META-INF/container.xml');
      if (!容器文件) throw new Error('无效的 EPUB 文件：缺少 container.xml');

      const 容器内容 = await 容器文件.async('string');
      const 容器文档 = 解析_OPF文档(容器内容);
      const 根文件元素 = 查找_元素(容器文档, 'rootfile');
      const 根文件路径 = 根文件元素?.getAttribute('full-path') || '';
      if (!根文件路径) throw new Error('无法找到 EPUB 根文件');

      const OPF文件 = 查找_压缩包文件(压缩包, 根文件路径);
      const 实际OPF路径 = 查找_实际路径(压缩包, 根文件路径);
      if (!OPF文件 || !实际OPF路径) throw new Error(`无法找到 OPF 文件: ${根文件路径}`);

      const OPF内容 = await OPF文件.async('string');
      const OPF文档 = 解析_OPF文档(OPF内容);
      const 文件清单 = 解析_文件清单(OPF文档, 实际OPF路径);
      const 章节顺序 = 解析_章节顺序(OPF文档, 文件清单);
      if (章节顺序.length === 0) throw new Error('EPUB 文件中没有可读内容');
      if (当前轮次 !== 加载轮次引用.current) return;

      章节路径引用.current = 章节顺序;
      设置元数据(解析_元数据(OPF文档));

      const EPUB目录 = await 解析_全部目录(压缩包, OPF文档, 实际OPF路径, 文件清单, 章节顺序);
      const 资源映射 = await 创建_资源映射(压缩包, 文件清单);
      if (当前轮次 !== 加载轮次引用.current) {
        资源映射.forEach((地址) => URL.revokeObjectURL(地址));
        return;
      }

      设置目录(EPUB目录);
      资源映射引用.current = 资源映射;
      资源地址引用.current = Array.from(资源映射.values());

      const 目录首章路径 = 查找_可用章节路径(查找_首个正文链接(EPUB目录));
      const 非封面章节路径 = 章节顺序.find(
        (路径) => !/(?:^|\/)(?:titlepage|cover|toc)(?:\.|$)/i.test(路径)
      );
      const 首章路径 = 目录首章路径 || 非封面章节路径 || 章节顺序[0];

      const 首章加载成功 = await 加载_章节内容(首章路径);
      if (!首章加载成功) throw new Error('首章内容无法读取');
      if (当前轮次 !== 加载轮次引用.current) return;

      设置正在加载(false);
    } catch (错误) {
      if (当前轮次 !== 加载轮次引用.current) return;
      console.error('加载 EPUB 失败:', 错误);
      设置错误信息(错误 instanceof Error ? 错误.message : '未知错误');
      设置正在加载(false);
    }
  }, [bookID, 加载_章节内容, 释放_资源地址]);

  const 处理_正文点击 = useCallback((事件: React.MouseEvent<HTMLDivElement>) => {
    if (!(事件.target instanceof Element)) return;
    const 链接 = 事件.target.closest('a[data-epub-path]') as HTMLAnchorElement | null;
    if (!链接) return;

    事件.preventDefault();
    const 路径 = 链接.dataset.epubPath || '';
    const 锚点 = 链接.dataset.epubFragment || '';
    if (路径) void 跳转_章节(`${路径}${锚点 ? `#${锚点}` : ''}`);
  }, [跳转_章节]);

  const 调整_字号 = useCallback((新字号: number) => {
    设置字号(新字号);
  }, []);

  useEffect(() => {
    void 加载_EPUB();
    return () => {
      加载轮次引用.current += 1;
      释放_资源地址();
    };
  }, [加载_EPUB, 释放_资源地址]);

  useEffect(() => {
    const 原网页标题 = document.title;
    const 书名 = 元数据.标题?.trim();

    if (书名) document.title = 书名;

    return () => {
      document.title = 原网页标题;
    };
  }, [元数据.标题]);

  useEffect(() => {
    const 阅读区 = 阅读区引用.current;
    if (!阅读区) return;

    阅读区.style.fontSize = `${字号}%`;
  }, [字号]);

  useEffect(() => {
    const 阅读区 = 阅读区引用.current;
    if (!阅读区 || !章节内容) return;

    let 第二次定位: number | undefined;
    const 定位 = () => {
      if (!待定位锚点) {
        阅读区.scrollTop = 0;
        return;
      }

      const 目标元素 = Array.from(阅读区.querySelectorAll<HTMLElement>('[id], [name]'))
        .find((元素) => 元素.id === 待定位锚点 || 元素.getAttribute('name') === 待定位锚点);
      if (目标元素) {
        目标元素.scrollIntoView({ block: 'start' });
      } else {
        阅读区.scrollTop = 0;
      }
    };

    const 第一帧 = requestAnimationFrame(() => {
      定位();
      第二次定位 = window.setTimeout(定位, 120);
    });

    return () => {
      cancelAnimationFrame(第一帧);
      if (第二次定位) window.clearTimeout(第二次定位);
    };
  }, [章节内容, 待定位锚点, 定位版本]);

  if (正在加载) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '15px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p>正在解析 EPUB 文件...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (错误信息) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '15px'
      }}>
        <h2>加载失败</h2>
        <p>{错误信息}</p>
        <button
          onClick={() => void 加载_EPUB()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          重试
        </button>
      </div>
    );
  }

  const 当前章节键 = 获取_路径键(当前章节路径);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }}>
      <style>{`
        [data-epub-body] {
          min-height: 100%;
        }

        [data-epub-body] svg {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          max-height: calc(100vh - 80px);
          margin: 0 auto;
        }

        [data-epub-body] img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ddd',
        flexShrink: 0
      }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#333' }}>
          {元数据.标题
            ? (元数据.标题.length > 25 ? `${元数据.标题.slice(0, 25)}...` : 元数据.标题)
            : '未知标题'
          }
          {元数据.作者 && (
            <span style={{ fontSize: '0.9rem', color: '#666', marginLeft: '10px' }}>
              {' '}- {元数据.作者}
            </span>
          )}
        </h3>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'white',
          padding: '5px 10px',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <button
            onClick={() => 调整_字号(字号 - 10)}
            disabled={字号 <= 70}
            style={{
              padding: '4px 8px',
              backgroundColor: '#eee',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 字号 <= 70 ? 'not-allowed' : 'pointer',
              opacity: 字号 <= 70 ? 0.5 : 1
            }}
          >
            A-
          </button>
          <span>{字号}%</span>
          <button
            onClick={() => 调整_字号(字号 + 10)}
            disabled={字号 >= 150}
            style={{
              padding: '4px 8px',
              backgroundColor: '#eee',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 字号 >= 150 ? 'not-allowed' : 'pointer',
              opacity: 字号 >= 150 ? 0.5 : 1
            }}
          >
            A+
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{
          width: '250px',
          backgroundColor: '#f9f9f9',
          borderRight: '1px solid #ddd',
          overflowY: 'auto',
          padding: '15px',
          flexShrink: 0
        }}>
          <h3 style={{ marginTop: 0, color: '#333', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
            目录
          </h3>
          {目录.length > 0 ? (
            <目录节点列表
              项目列表={目录}
              当前章节键={当前章节键}
              层级={0}
              选择目录={(链接) => void 跳转_章节(链接)}
            />
          ) : (
            <p style={{ color: '#777' }}>暂无目录</p>
          )}
        </div>

        <div
          ref={阅读区引用}
          onClick={处理_正文点击}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '40px',
            overflow: 'auto',
            backgroundColor: '#fefefe',
            fontSize: '100%',
            lineHeight: 1.6
          }}
          dangerouslySetInnerHTML={{ __html: 章节内容 }}
        ></div>
        <AI图书助手 bookID={Number(bookID || 0)} 页面类型="EPUB" 阅读区引用={阅读区引用} />
      </div>
    </div>
  );
};

export default Epub阅读器;

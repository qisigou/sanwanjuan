import React, { useEffect, useRef, useState } from 'react';
import '../CSS/AI图书助手.css';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

export type 图书字段键 =
  | 'title'
  | 'author'
  | 'publisher'
  | 'publication_year'
  | 'edition'
  | 'description'
  | 'series'
  | 'isbn'
  | 'clc'
  | 'tags'
  | 'language';

interface 图书表单 {
  title: string;
  author: string;
  publisher: string;
  publication_year: string;
  edition: string;
  description: string;
  series: string;
  isbn: string;
  clc: string;
  tags: string;
  language: string;
  ai_score: string;
  ai_evaluation: string;
}

interface 图书记录 {
  id: number;
  title: string | null;
  author: string | null;
  publisher: string | null;
  publication_year: number | null;
  edition: number | null;
  description: string | null;
  series: string | null;
  isbn: string | null;
  clc: string | null;
  tags: string | null;
  language: string | null;
  ai_score: number | null;
  ai_assessment_status: number | null;
  ai_evaluation: string | null;
}

interface 字段建议 {
  value?: string | number | string[] | null;
  confidence?: number;
  method?: string;
  source?: string;
  reason?: string;
}

interface 中图法候选 {
  value?: string;
  label?: string;
  confidence?: number;
  reason?: string;
}

interface 分类评估结果 {
  clc?: 字段建议 & { label?: string; candidates?: 中图法候选[] };
  tags?: 字段建议;
  ai_score?: 字段建议;
  ai_evaluation?: 字段建议;
  warnings?: string[];
}

interface 采集图片 {
  id: string;
  名称: string;
  dataUrl: string;
}

interface AI图书助手属性 {
  bookID: number;
  页面类型?: 'EPUB' | 'PDF';
  阅读区引用?: React.RefObject<HTMLDivElement | HTMLIFrameElement | null>;
}

const 空表单: 图书表单 = {
  title: '',
  author: '',
  publisher: '',
  publication_year: '',
  edition: '',
  description: '',
  series: '',
  isbn: '',
  clc: '',
  tags: '',
  language: '',
  ai_score: '',
  ai_evaluation: '',
};

const 字段定义: Array<{
  键: 图书字段键;
  标签: string;
  类型?: 'text' | 'number';
  多行?: boolean;
}> = [
  { 键: 'title', 标签: '书名' },
  { 键: 'author', 标签: '作者（含译者）' },
  { 键: 'publisher', 标签: '出版社' },
  { 键: 'publication_year', 标签: '出版时间', 类型: 'number' },
  { 键: 'edition', 标签: '版次', 类型: 'number' },
  { 键: 'description', 标签: '内容简介', 多行: true },
  { 键: 'series', 标签: '所属丛卷' },
  { 键: 'isbn', 标签: 'ISBN' },
  { 键: 'clc', 标签: '中图法' },
  { 键: 'tags', 标签: '标签' },
  { 键: 'language', 标签: '文本语言' },
];

const 内联样式属性 = [
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'white-space',
  'word-break',
  'overflow-wrap',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'width',
  'height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'box-sizing',
  'object-fit',
  'vertical-align',
  'list-style',
  'opacity',
  'transform',
];

const 生成_临时标识 = (): string => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const 读取_文件为数据地址 = (文件: File): Promise<string> => {
  return new Promise((解决, 拒绝) => {
    const 读取器 = new FileReader();
    读取器.onload = () => 解决(String(读取器.result || ''));
    读取器.onerror = () => 拒绝(new Error('读取图片失败'));
    读取器.readAsDataURL(文件);
  });
};

const 压缩_图片数据地址 = async (数据地址: string): Promise<string> => {
  const 图像 = await new Promise<HTMLImageElement>((解决, 拒绝) => {
    const 元素 = new Image();
    元素.onload = () => 解决(元素);
    元素.onerror = () => 拒绝(new Error('图片加载失败'));
    元素.src = 数据地址;
  });

  const 最大边长 = 2200;
  const 缩放比例 = Math.min(1, 最大边长 / Math.max(图像.naturalWidth, 图像.naturalHeight));
  const 宽 = Math.max(1, Math.round(图像.naturalWidth * 缩放比例));
  const 高 = Math.max(1, Math.round(图像.naturalHeight * 缩放比例));
  const 画布 = document.createElement('canvas');
  画布.width = 宽;
  画布.height = 高;
  const 上下文 = 画布.getContext('2d');
  if (!上下文) throw new Error('浏览器无法创建图片画布');

  上下文.fillStyle = '#ffffff';
  上下文.fillRect(0, 0, 宽, 高);
  上下文.drawImage(图像, 0, 0, 宽, 高);
  return 画布.toDataURL('image/jpeg', 0.9);
};

const 复制_元素样式 = (源元素: HTMLElement, 目标元素: HTMLElement) => {
  const 计算样式 = window.getComputedStyle(源元素);
  内联样式属性.forEach((属性) => {
    const 值 = 计算样式.getPropertyValue(属性);
    if (值) 目标元素.style.setProperty(属性, 值);
  });
};

const 捕获_阅读区 = async (阅读区: HTMLDivElement | HTMLIFrameElement): Promise<string> => {
  if (阅读区 instanceof HTMLIFrameElement) {
    return 捕获_屏幕区域(阅读区);
  }

  const 宽 = 阅读区.clientWidth;
  const 高 = 阅读区.clientHeight;
  if (!宽 || !高) throw new Error('阅读区域暂不可截取');

  const 副本 = 阅读区.cloneNode(true) as HTMLDivElement;
  const 源元素列表 = [阅读区, ...Array.from(阅读区.querySelectorAll<HTMLElement>('*'))];
  const 副本元素列表 = [副本, ...Array.from(副本.querySelectorAll<HTMLElement>('*'))];
  源元素列表.forEach((源元素, 索引) => {
    const 目标元素 = 副本元素列表[索引];
    if (目标元素) 复制_元素样式(源元素, 目标元素);
  });

  const 源图片列表 = Array.from(阅读区.querySelectorAll<HTMLImageElement>('img'));
  const 副本图片列表 = Array.from(副本.querySelectorAll<HTMLImageElement>('img'));
  await Promise.all(源图片列表.map(async (源图片, 索引) => {
    const 目标图片 = 副本图片列表[索引];
    if (!目标图片 || !源图片.src) return;
    try {
      const 响应 = await fetch(源图片.src);
      if (!响应.ok) return;
      const 图片块 = await 响应.blob();
      目标图片.src = await 读取_文件为数据地址(new File([图片块], '图片', { type: 图片块.type }));
    } catch {
      // 单张图片无法内联时仍继续截取文字区域。
    }
  }));

  副本.querySelectorAll('script, link[rel="stylesheet"]').forEach((元素) => 元素.remove());
  副本.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  副本.style.width = `${宽}px`;
  副本.style.height = `${高}px`;
  副本.style.overflow = 'hidden';
  副本.style.padding = '0';

  const 计算样式 = window.getComputedStyle(阅读区);
  const 内容容器 = document.createElement('div');
  内容容器.style.position = 'relative';
  内容容器.style.top = `-${阅读区.scrollTop}px`;
  内容容器.style.boxSizing = 'border-box';
  内容容器.style.width = '100%';
  内容容器.style.padding = [
    计算样式.paddingTop,
    计算样式.paddingRight,
    计算样式.paddingBottom,
    计算样式.paddingLeft,
  ].join(' ');
  while (副本.firstChild) 内容容器.appendChild(副本.firstChild);
  副本.appendChild(内容容器);

  const 序列化内容 = new XMLSerializer().serializeToString(副本);
  const SVG内容 = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${宽}" height="${高}" viewBox="0 0 ${宽} ${高}">
      <foreignObject width="100%" height="100%">${序列化内容}</foreignObject>
    </svg>
  `;
  const SVG地址 = URL.createObjectURL(new Blob([SVG内容], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const 图像 = await new Promise<HTMLImageElement>((解决, 拒绝) => {
      const 元素 = new Image();
      元素.onload = () => 解决(元素);
      元素.onerror = () => 拒绝(new Error('浏览器无法生成阅读区截图'));
      元素.src = SVG地址;
    });
    const 缩放比例 = Math.min(1.5, 4096 / 宽, 4096 / 高);
    const 画布 = document.createElement('canvas');
    画布.width = Math.max(1, Math.round(宽 * 缩放比例));
    画布.height = Math.max(1, Math.round(高 * 缩放比例));
    const 上下文 = 画布.getContext('2d');
    if (!上下文) throw new Error('浏览器无法创建截图画布');
    上下文.fillStyle = '#ffffff';
    上下文.fillRect(0, 0, 画布.width, 画布.height);
    上下文.drawImage(图像, 0, 0, 画布.width, 画布.height);
    return 画布.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(SVG地址);
  }
};

const 捕获_屏幕区域 = async (目标元素: HTMLElement): Promise<string> => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('当前浏览器不支持页面截图，请使用选择图片或粘贴截图');
  }

  const 媒体配置 = {
    video: {
      displaySurface: 'browser',
      frameRate: 1,
      width: { ideal: Math.max(1, window.innerWidth * window.devicePixelRatio) },
      height: { ideal: Math.max(1, window.innerHeight * window.devicePixelRatio) },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    monitorTypeSurfaces: 'exclude',
  } as DisplayMediaStreamOptions & {
    preferCurrentTab?: boolean;
    selfBrowserSurface?: 'include' | 'exclude';
    surfaceSwitching?: 'include' | 'exclude';
    monitorTypeSurfaces?: 'include' | 'exclude';
  };
  const 媒体流 = await navigator.mediaDevices.getDisplayMedia(媒体配置);
  const 视频 = document.createElement('video');
  视频.srcObject = 媒体流;
  视频.muted = true;
  await 视频.play();

  try {
    const 视频轨道 = 媒体流.getVideoTracks()[0];
    const 轨道设置 = 视频轨道?.getSettings();
    if (轨道设置?.displaySurface && 轨道设置.displaySurface !== 'browser') {
      throw new Error('请选择当前浏览器标签页，而不是整个屏幕或其它窗口');
    }

    await new Promise<void>((解决) => {
      const 带帧回调视频 = 视频 as HTMLVideoElement & {
        requestVideoFrameCallback?: (回调: () => void) => number;
      };
      if (带帧回调视频.requestVideoFrameCallback) {
        带帧回调视频.requestVideoFrameCallback(() => 解决());
      } else {
        window.setTimeout(解决, 120);
      }
    });

    if (!视频.videoWidth || !视频.videoHeight) {
      throw new Error('浏览器没有返回可用的页面图像');
    }

    const 目标矩形 = 目标元素.getBoundingClientRect();
    const 横轴比例 = 视频.videoWidth / Math.max(1, window.innerWidth);
    const 纵轴比例 = 视频.videoHeight / Math.max(1, window.innerHeight);
    const 源横坐标 = Math.max(0, Math.floor(目标矩形.left * 横轴比例));
    const 源纵坐标 = Math.max(0, Math.floor(目标矩形.top * 纵轴比例));
    const 源宽度 = Math.max(
      1,
      Math.min(
        Math.round(目标矩形.width * 横轴比例),
        视频.videoWidth - 源横坐标,
      ),
    );
    const 源高度 = Math.max(
      1,
      Math.min(
        Math.round(目标矩形.height * 纵轴比例),
        视频.videoHeight - 源纵坐标,
      ),
    );

    const 最大边长 = 4096;
    const 缩放比例 = Math.min(1, 最大边长 / 源宽度, 最大边长 / 源高度);
    const 画布 = document.createElement('canvas');
    画布.width = Math.max(1, Math.round(源宽度 * 缩放比例));
    画布.height = Math.max(1, Math.round(源高度 * 缩放比例));
    const 上下文 = 画布.getContext('2d');
    if (!上下文) throw new Error('浏览器无法创建页面截图画布');
    上下文.fillStyle = '#ffffff';
    上下文.fillRect(0, 0, 画布.width, 画布.height);
    上下文.drawImage(
      视频,
      源横坐标,
      源纵坐标,
      源宽度,
      源高度,
      0,
      0,
      画布.width,
      画布.height,
    );
    return 画布.toDataURL('image/jpeg', 0.92);
  } finally {
    媒体流.getTracks().forEach((轨道) => 轨道.stop());
  }
};

const 获取_建议文本 = (值: 字段建议['value']): string => {
  if (Array.isArray(值)) return 值.join('，');
  if (值 === null || 值 === undefined) return '';
  return String(值);
};

const 获取_置信度文本 = (置信度?: number): string => {
  if (typeof 置信度 !== 'number' || Number.isNaN(置信度)) return '未提供置信度';
  const 百分比 = Math.round(Math.max(0, Math.min(1, 置信度)) * 100);
  return `置信度 ${百分比}%`;
};

const 获取_方法文本 = (方法?: string): string => {
  const 映射: Record<string, string> = {
    source: '原文提取',
    normalized: '规范化',
    inferred: 'AI 推断',
    generated: 'AI 生成',
  };
  return 映射[方法 || ''] || 'AI 建议';
};

const 从图书记录生成表单 = (图书: 图书记录): 图书表单 => ({
  title: 图书.title || '',
  author: 图书.author || '',
  publisher: 图书.publisher || '',
  publication_year: 图书.publication_year?.toString() || '',
  edition: 图书.edition?.toString() || '',
  description: 图书.description || '',
  series: 图书.series || '',
  isbn: 图书.isbn || '',
  clc: 图书.clc || '',
  tags: 图书.tags || '',
  language: 图书.language || '',
  ai_score: 图书.ai_score?.toString() || '',
  ai_evaluation: 图书.ai_evaluation || '',
});

const AI图书助手: React.FC<AI图书助手属性> = ({ bookID, 页面类型 = 'EPUB', 阅读区引用 }) => {
  const [展开, 设置展开] = useState(false);
  const [图片列表, 设置图片列表] = useState<采集图片[]>([]);
  const [表单, 设置表单] = useState<图书表单>(空表单);
  const [字段建议, 设置字段建议] = useState<Partial<Record<图书字段键, 字段建议>>>({});
  const [提取警告, 设置提取警告] = useState<string[]>([]);
  const [评估结果, 设置评估结果] = useState<分类评估结果 | null>(null);
  const [模型状态, 设置模型状态] = useState<{ configured: boolean; message: string; model: string } | null>(null);
  const [正在读取图书, 设置正在读取图书] = useState(false);
  const [正在提取, 设置正在提取] = useState(false);
  const [正在评估, 设置正在评估] = useState(false);
  const [正在保存, 设置正在保存] = useState(false);
  const [错误信息, 设置错误信息] = useState('');
  const [提示信息, 设置提示信息] = useState('');
  const 文件输入引用 = useRef<HTMLInputElement>(null);

  const 请求_后端 = async (路径: string, 请求配置?: RequestInit) => {
    const 响应 = await fetch(`${API_BASE}${路径}`, 请求配置);
    let 数据: Record<string, unknown> = {};
    try {
      数据 = await 响应.json();
    } catch {
      数据 = {};
    }
    if (!响应.ok) {
      const 错误 = typeof 数据.error === 'string' ? 数据.error : `请求失败: ${响应.status}`;
      throw new Error(错误);
    }
    return 数据;
  };

  const 添加_图片文件 = async (文件列表: File[]) => {
    const 图片文件 = 文件列表.filter((文件) => 文件.type.startsWith('image/'));
    if (!图片文件.length) return;

    try {
      设置错误信息('');
      const 新图片: 采集图片[] = [];
      for (const 文件 of 图片文件) {
        const 原始地址 = await 读取_文件为数据地址(文件);
        const 数据地址 = await 压缩_图片数据地址(原始地址);
        新图片.push({ id: 生成_临时标识(), 名称: 文件.name || '截图', dataUrl: 数据地址 });
      }
      设置图片列表((当前列表) => [...当前列表, ...新图片]);
      设置提示信息(`已添加 ${新图片.length} 张图片，请翻到目标页后继续采集。`);
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '图片读取失败');
    }
  };

  const 加载_图书信息 = async () => {
    设置正在读取图书(true);
    设置错误信息('');
    try {
      const 数据 = await 请求_后端(`/books?id=${bookID}&page=1&per_page=1`);
      const 图书记录列表 = Array.isArray(数据.data) ? 数据.data as 图书记录[] : [];
      if (!图书记录列表.length) throw new Error('未找到图书信息');
      设置表单(从图书记录生成表单(图书记录列表[0]));
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '图书信息加载失败');
    } finally {
      设置正在读取图书(false);
    }
  };

  useEffect(() => {
    if (!展开 || 正在读取图书 || 表单.title) return;
    void 加载_图书信息();
  }, [展开]);

  useEffect(() => {
    let 已取消 = false;
    void 请求_后端('/ai/status')
      .then((数据) => {
        if (已取消) return;
        const 状态 = data_to_dict(数据.data);
        设置模型状态({
          configured: Boolean(状态.configured),
          message: String(状态.message || ''),
          model: String(状态.model || ''),
        });
      })
      .catch((错误) => {
        if (!已取消) 设置模型状态({ configured: false, message: 错误.message, model: '' });
      });
    return () => {
      已取消 = true;
    };
  }, []);

  useEffect(() => {
    if (!展开) return;
    const 处理粘贴 = (事件: ClipboardEvent) => {
      const 文件列表 = Array.from(事件.clipboardData?.files || []);
      if (文件列表.length) {
        事件.preventDefault();
        void 添加_图片文件(文件列表);
      }
    };
    document.addEventListener('paste', 处理粘贴);
    return () => document.removeEventListener('paste', 处理粘贴);
  }, [展开]);

  const data_to_dict = (值: unknown): Record<string, unknown> => {
    return typeof 值 === 'object' && 值 !== null ? 值 as Record<string, unknown> : {};
  };

  const 截取_阅读区 = async () => {
    const 阅读区 = 阅读区引用?.current;
    if (!阅读区) {
      设置错误信息('当前阅读页面不支持直接截取，请使用选择图片或粘贴截图');
      return;
    }
    try {
      设置错误信息('');
      设置提示信息('正在生成阅读区截图...');
      const 数据地址 = await 捕获_阅读区(阅读区);
      设置图片列表((当前列表) => [
        ...当前列表,
        { id: 生成_临时标识(), 名称: '阅读区截图', dataUrl: 数据地址 },
      ]);
      设置提示信息('截图完成。可以继续翻页采集，或开始提取信息。');
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '阅读区截图失败');
    }
  };

  const 截取_页面 = async () => {
    const 目标元素 = 阅读区引用?.current;
    if (!目标元素) {
      设置错误信息('当前页面没有可截取的阅读区域');
      return;
    }
    try {
      设置错误信息('');
      设置提示信息('请在浏览器提示中只选择当前标签页，系统将自动裁剪到阅读区域。');
      const 数据地址 = await 捕获_屏幕区域(目标元素);
      设置图片列表((当前列表) => [
        ...当前列表,
        { id: 生成_临时标识(), 名称: '页面截图', dataUrl: 数据地址 },
      ]);
      设置提示信息('页面截图完成。');
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '页面截图失败');
    }
  };

  const 删除_图片 = (图片ID: string) => {
    设置图片列表((当前列表) => 当前列表.filter((图片) => 图片.id !== 图片ID));
  };

  const 修改_字段 = (键: keyof 图书表单, 值: string) => {
    设置表单((当前表单) => ({ ...当前表单, [键]: 值 }));
  };

  const 采用_建议 = (键: 图书字段键) => {
    const 新值 = 获取_建议文本(字段建议[键]?.value);
    设置表单((当前表单) => ({ ...当前表单, [键]: 新值 }));
    设置提示信息(`已采用“${字段定义.find((字段) => 字段.键 === 键)?.标签 || 键}”的 AI 建议。`);
  };

  const 采用_全部建议 = () => {
    设置表单((当前表单) => {
      const 新表单 = { ...当前表单 };
      字段定义.forEach((字段) => {
        const 建议值 = 获取_建议文本(字段建议[字段.键]?.value);
        if (建议值) 新表单[字段.键] = 建议值;
      });
      return 新表单;
    });
  };

  const 提取_图书信息 = async () => {
    if (!图片列表.length) {
      设置错误信息('请先截图或选择图书页面图片');
      return;
    }
    设置正在提取(true);
    设置错误信息('');
    设置提示信息('正在让模型识别图书页面...');
    try {
      const 数据 = await 请求_后端(`/ai/books/${bookID}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: 图片列表.map((图片) => ({ data_url: 图片.dataUrl, label: 图片.名称 })),
        }),
      });
      const 返回数据 = data_to_dict(数据.data);
      const 字段数据 = data_to_dict(返回数据.fields) as Partial<Record<图书字段键, 字段建议>>;
      设置字段建议(字段数据);
      设置提取警告(Array.isArray(返回数据.warnings) ? 返回数据.warnings.map(String) : []);
      设置提示信息('识别完成。请核对并采用需要的字段。');
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '图书信息提取失败');
    } finally {
      设置正在提取(false);
    }
  };

  const 构建_提交数据 = () => ({
    title: 表单.title.trim(),
    author: 表单.author.trim(),
    publisher: 表单.publisher.trim(),
    publication_year: 表单.publication_year ? Number(表单.publication_year) : null,
    edition: 表单.edition ? Number(表单.edition) : null,
    description: 表单.description.trim(),
    series: 表单.series.trim(),
    isbn: 表单.isbn.trim(),
    clc: 表单.clc.trim(),
    tags: 表单.tags.trim(),
    language: 表单.language.trim(),
    ai_score: 表单.ai_score ? Number(表单.ai_score) : null,
    ai_assessment_status: 表单.ai_score || 表单.ai_evaluation ? 1 : 0,
    ai_evaluation: 表单.ai_evaluation.trim(),
  });

  const 生成_分类与评估 = async () => {
    设置正在评估(true);
    设置错误信息('');
    设置提示信息('正在生成中图法分类和 AI 初评...');
    try {
      const 数据 = await 请求_后端(`/ai/books/${bookID}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: 构建_提交数据(),
          images: 图片列表.map((图片) => ({ data_url: 图片.dataUrl, label: 图片.名称 })),
        }),
      });
      设置评估结果(data_to_dict(数据.data) as 分类评估结果);
      设置提示信息('分类与初评已生成。请确认后采用。');
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '分类与评估失败');
    } finally {
      设置正在评估(false);
    }
  };

  const 采用_评估结果 = () => {
    if (!评估结果) return;
    设置表单((当前表单) => ({
      ...当前表单,
      clc: 获取_建议文本(评估结果.clc?.value) || 当前表单.clc,
      tags: 获取_建议文本(评估结果.tags?.value) || 当前表单.tags,
      ai_score: 获取_建议文本(评估结果.ai_score?.value) || 当前表单.ai_score,
      ai_evaluation: 获取_建议文本(评估结果.ai_evaluation?.value) || 当前表单.ai_evaluation,
    }));
    设置提示信息('已采用中图法、标签和 AI 初评，请最后核对并提交。');
  };

  const 保存_图书信息 = async () => {
    if (!表单.title.trim()) {
      设置错误信息('书名不能为空');
      return;
    }
    设置正在保存(true);
    设置错误信息('');
    设置提示信息('');
    try {
      const 数据 = await 请求_后端(`/books/${bookID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(构建_提交数据()),
      });
      const 返回图书 = data_to_dict(数据.data) as unknown as 图书记录;
      if (返回图书?.id) 设置表单(从图书记录生成表单(返回图书));
      设置提示信息('图书信息、AI 评分和 AI 评估已提交。');
    } catch (错误) {
      设置错误信息(错误 instanceof Error ? 错误.message : '图书信息保存失败');
    } finally {
      设置正在保存(false);
    }
  };

  if (!展开) {
    return (
      <button
        type="button"
        className="ai图书助手入口"
        onClick={() => 设置展开(true)}
        aria-label="展开 AI 图书录入助手"
      >
        <span className="ai图书助手入口标记">AI</span>
        <span className="ai图书助手入口文字">版权录入</span>
      </button>
    );
  }

  return (
    <aside className="ai图书助手" aria-label="AI 图书录入助手">
      <header className="ai图书助手头部">
        <div>
          <strong>图书编目信息录入助手</strong>
          <div className={`ai图书助手模型状态 ${模型状态?.configured ? '已配置' : '未配置'}`}>
            {模型状态?.configured
              ? `模型可用${模型状态.model ? `：${模型状态.model}` : ''}`
              : 模型状态?.message || '正在检查模型配置'}
          </div>
            {/* 成本说明：仅在模型可用时显示 */}
          {模型状态?.configured && (
            <div className="ai图书助手提示">
              大语言模型图像识别消耗词丁(token) 很多，单次调用可能花费 0.1 元
            </div>
          )}
        </div>
        <button type="button" className="ai图书助手图标按钮" onClick={() => 设置展开(false)}>
          收起
        </button>
      </header>

      <div className="ai图书助手正文">
        <section className="ai图书助手区域">
          <div className="ai图书助手区域标题">
            <span>1. 采集图书页面</span>
            <span>{图片列表.length} 张</span>
          </div>
          <p className="ai图书助手说明">
            翻到书名页、版权页或封底后截取阅读区域；PDF 会请求仅在当前标签页中截图，并自动裁剪阅读区域。
          </p>
          <div className="ai图书助手按钮组">
            {页面类型 === 'PDF' ? (
              <button type="button" onClick={() => void 截取_页面()} disabled={!阅读区引用}>
                截取当前页面
              </button>
            ) : (
              <button type="button" onClick={() => void 截取_阅读区()} disabled={!阅读区引用}>
                截取阅读区
              </button>
            )}
            <button type="button" onClick={() => 文件输入引用.current?.click()}>
              选择图片
            </button>
          </div>
          <input
            ref={文件输入引用}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(事件) => {
              const 文件列表 = Array.from(事件.target.files || []);
              void 添加_图片文件(文件列表);
              事件.target.value = '';
            }}
          />

          {图片列表.length > 0 && (
            <div className="ai图书助手图片列表">
              {图片列表.map((图片, 索引) => (
                <div className="ai图书助手图片项" key={图片.id}>
                  <img src={图片.dataUrl} alt={`采集图片 ${索引 + 1}`} />
                  <span>{索引 + 1}</span>
                  <button type="button" onClick={() => 删除_图片(图片.id)} aria-label={`删除第 ${索引 + 1} 张图片`}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="ai图书助手主要按钮"
            onClick={() => void 提取_图书信息()}
            disabled={正在提取 || !图片列表.length}
          >
            {正在提取 ? '正在提取...' : '提取书目信息'}
          </button>
        </section>

        <section className="ai图书助手区域">
          <div className="ai图书助手区域标题">
            <span>2. 核对并填写字段</span>
            <span>{Object.keys(字段建议).length ? `${Object.keys(字段建议).length} 项建议` : '尚无建议'}</span>
          </div>
          {Object.keys(字段建议).length > 0 && (
            <button type="button" className="ai图书助手次按钮 全宽" onClick={采用_全部建议}>
              采用全部非空建议
            </button>
          )}

          {字段定义.map((字段) => {
            const 建议 = 字段建议[字段.键];
            const 建议文本 = 获取_建议文本(建议?.value);
            const 当前值 = 表单[字段.键];
            return (
              <label className="ai图书助手字段" key={字段.键}>
                <span className="ai图书助手字段标题">
                  <span>{字段.标签}</span>
                  {建议 && <span className="ai图书助手代码标签">{获取_方法文本(建议.method)}</span>}
                </span>
                {字段.多行 ? (
                  <textarea
                    rows={5}
                    value={当前值}
                    onChange={(事件) => 修改_字段(字段.键, 事件.target.value)}
                  />
                ) : (
                  <input
                    type={字段.类型 || 'text'}
                    value={当前值}
                    onChange={(事件) => 修改_字段(字段.键, 事件.target.value)}
                  />
                )}
                {建议 && (
                  <div className={`ai图书助手建议 ${建议文本 && 建议文本 === 当前值 ? '已采用' : ''}`}>
                    <div>
                      <strong>AI：{建议文本 || '未找到'}</strong>
                      <span>{获取_置信度文本(建议.confidence)}</span>
                    </div>
                    {(建议.source || 建议.reason) && (
                      <p>{[建议.source, 建议.reason].filter(Boolean).join('；')}</p>
                    )}
                    {建议文本 && 建议文本 !== 当前值 && (
                      <button type="button" onClick={() => 采用_建议(字段.键)}>采用此建议</button>
                    )}
                  </div>
                )}
              </label>
            );
          })}

          {提取警告.length > 0 && (
            <div className="ai图书助手警告">
              <strong>需要留意</strong>
              {提取警告.map((警告, 索引) => <p key={`${警告}-${索引}`}>{警告}</p>)}
            </div>
          )}
        </section>

        <section className="ai图书助手区域">
          <div className="ai图书助手区域标题">
            <span>3. 中图法与 AI 初评</span>
            <span>1 至 5 分</span>
          </div>
          <p className="ai图书助手说明">
            基础字段核对后生成。作者与出版社只作为辅助依据，信息不足时模型应给出较低置信度。
          </p>
          <button
            type="button"
            className="ai图书助手主要按钮"
            onClick={() => void 生成_分类与评估()}
            disabled={正在评估 || !表单.title.trim()}
          >
            {正在评估 ? '正在生成...' : '生成中图法与 AI 初评'}
          </button>

          {评估结果 && (
            <div className="ai图书助手评估卡">
              <div className="ai图书助手评估标题">
                <strong>中图法建议</strong>
                <span>{获取_置信度文本(评估结果.clc?.confidence)}</span>
              </div>
              <div className="ai图书助手候选列表">
                {(评估结果.clc?.candidates?.length
                  ? 评估结果.clc.candidates
                  : [{ value: 评估结果.clc?.value, label: 评估结果.clc?.label }]
                ).map((候选, 索引) => (
                  <button
                    type="button"
                    key={`${候选.value || '空'}-${索引}`}
                    onClick={() => 修改_字段('clc', 候选.value || '')}
                  >
                    <strong>{候选.value || '无明确分类'}</strong>
                    <span>{候选.label || '未提供分类名'}</span>
                    <small>{获取_置信度文本(候选.confidence)}</small>
                  </button>
                ))}
              </div>
              {评估结果.clc?.reason && <p>{评估结果.clc.reason}</p>}

              <div className="ai图书助手建议 已采用">
                <div>
                  <strong>标签建议：{获取_建议文本(评估结果.tags?.value) || '未提供'}</strong>
                  <span>{获取_置信度文本(评估结果.tags?.confidence)}</span>
                </div>
                {评估结果.tags?.reason && <p>{评估结果.tags.reason}</p>}
              </div>

              <div className="ai图书助手建议">
                <div>
                  <strong>AI 评分建议：{获取_建议文本(评估结果.ai_score?.value) || '未提供'} / 5</strong>
                  <span>{获取_置信度文本(评估结果.ai_score?.confidence)}</span>
                </div>
                {评估结果.ai_score?.reason && <p>{评估结果.ai_score.reason}</p>}
              </div>

              <div className="ai图书助手评估字段">
                <span>确认评分</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={表单.ai_score}
                  onChange={(事件) => 修改_字段('ai_score', 事件.target.value)}
                />
              </div>
              <label className="ai图书助手字段">
                <span className="ai图书助手字段标题">AI 评估</span>
                <textarea
                  rows={4}
                  value={表单.ai_evaluation}
                  onChange={(事件) => 修改_字段('ai_evaluation', 事件.target.value)}
                />
              </label>
              <div className="ai图书助手评估说明">
                <span>{获取_方法文本('generated')}：{获取_建议文本(评估结果.ai_evaluation?.value)}</span>
                <span>{获取_置信度文本(评估结果.ai_evaluation?.confidence)}</span>
              </div>
              {评估结果.warnings && 评估结果.warnings.length > 0 && (
                <div className="ai图书助手警告">
                  {评估结果.warnings.map((警告, 索引) => <p key={`${警告}-${索引}`}>{警告}</p>)}
                </div>
              )}
              <button type="button" className="ai图书助手主要按钮" onClick={采用_评估结果}>
                采用分类、标签和初评
              </button>
            </div>
          )}
        </section>
      </div>

      <footer className="ai图书助手底部">
        {(错误信息 || 提示信息) && (
          <div className={`ai图书助手反馈 ${错误信息 ? '错误' : '成功'}`} role={错误信息 ? 'alert' : 'status'}>
            {错误信息 || 提示信息}
          </div>
        )}
        <button
          type="button"
          className="ai图书助手提交按钮"
          onClick={() => void 保存_图书信息()}
          disabled={正在保存 || !表单.title.trim()}
        >
          {正在保存 ? '正在提交...' : '确认提交数据库'}
        </button>
      </footer>
    </aside>
  );
};

export default AI图书助手;

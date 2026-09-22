import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;
const 每页数量 = 20;

interface 图书信息 {
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
  file_format: string | null;
  storage_location: string | null;
  storage_file_name: string | null;
  storage_status: string | null;
  created_at: number | null;
  updated_at: number | null;
}

interface 分页信息 {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

interface 图书列表响应 {
  success: boolean;
  data: 图书信息[];
  pagination: 分页信息;
  error?: string;
}

interface 图书更新响应 {
  success: boolean;
  message?: string;
  error?: string;
}

interface 编辑表单 {
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
}

const 空表单: 编辑表单 = {
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
};

const 单行字段: Array<{ 键: keyof 编辑表单; 标签: string; 类型?: string }> = [
  { 键: 'title', 标签: '书名' },
  { 键: 'author', 标签: '作者' },
  { 键: 'publisher', 标签: '出版社' },
  { 键: 'publication_year', 标签: '出版时间', 类型: 'number' },
  { 键: 'edition', 标签: '版次', 类型: 'number' },
  { 键: 'series', 标签: '所属丛卷' },
  { 键: 'isbn', 标签: 'isbn' },
  { 键: 'clc', 标签: '中图法' },
  { 键: 'tags', 标签: '标签' },
  { 键: 'language', 标签: '文本语言' },
];


const 构建阅读链接 = (图书: 图书信息): string => {
  if ((图书.file_format || '').toUpperCase() === 'EPUB') {
    return `/epub_reader/${图书.id}`;
  }
  return `/pdf_reader/${图书.id}`;
};


const 格式化入库时间 = (时间戳: number | null): string => {
  if (!时间戳) {
    return '-';
  }
  return new Date(时间戳 * 1000).toLocaleString('zh-CN', { hour12: false });
};


const 修改图书: React.FC = () => {
  const [图书列表, set图书列表] = useState<图书信息[]>([]);
  const [分页, set分页] = useState<分页信息>({
    page: 1,
    per_page: 每页数量,
    total: 0,
    total_pages: 0,
  });
  const [页码, set页码] = useState(1);
  const [ID输入, setID输入] = useState('');
  const [查询ID, set查询ID] = useState('');
  const [加载中, set加载中] = useState(false);
  const [页面错误, set页面错误] = useState('');
  const [提示信息, set提示信息] = useState('');
  const [编辑图书, set编辑图书] = useState<图书信息 | null>(null);
  const [表单, set表单] = useState<编辑表单>(空表单);
  const [保存中, set保存中] = useState(false);
  const [弹窗错误, set弹窗错误] = useState('');

  const 加载图书列表 = async (目标页码 = 页码, 目标ID = 查询ID) => {
    set加载中(true);
    set页面错误('');

    try {
      const 响应 = await axios.get<图书列表响应>(`${API_BASE}/books`, {
        params: {
          page: 目标页码,
          per_page: 每页数量,
          ...(目标ID ? { id: 目标ID } : {}),
        },
      });
      set图书列表(响应.data.data);
      set分页(响应.data.pagination);
    } catch (错误) {
      let 错误信息 = '图书列表加载失败，请稍后重试。';
      if (axios.isAxiosError(错误)) {
        const 响应数据 = 错误.response?.data as { error?: string } | undefined;
        错误信息 = 响应数据?.error || 错误.message || 错误信息;
      }
      set图书列表([]);
      set页面错误(错误信息);
    } finally {
      set加载中(false);
    }
  };

  useEffect(() => {
    void 加载图书列表(页码, 查询ID);
  }, [页码, 查询ID]);

  const 提交ID搜索 = (事件: React.FormEvent<HTMLFormElement>) => {
    事件.preventDefault();
    const 新ID = ID输入.trim();

    if (新ID && (!/^\d+$/.test(新ID) || Number(新ID) < 1)) {
      set页面错误('图书 ID 必须是大于 0 的整数。');
      return;
    }

    set页面错误('');
    set页码(1);
    if (查询ID === 新ID && 页码 === 1) {
      void 加载图书列表(1, 新ID);
    } else {
      set查询ID(新ID);
    }
  };

  const 清除ID搜索 = () => {
    setID输入('');
    set页面错误('');
    set页码(1);
    if (!查询ID && 页码 === 1) {
      void 加载图书列表(1, '');
    } else {
      set查询ID('');
    }
  };

  const 打开修改弹窗 = (图书: 图书信息) => {
    set编辑图书(图书);
    set表单({
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
    });
    set弹窗错误('');
  };

  const 关闭修改弹窗 = () => {
    if (保存中) {
      return;
    }
    set编辑图书(null);
    set弹窗错误('');
  };

  const 处理字段变化 = (
    事件: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const 字段 = 事件.target.name as keyof 编辑表单;
    set表单((当前表单) => ({ ...当前表单, [字段]: 事件.target.value }));
  };

  const 提交修改 = async (事件: React.FormEvent<HTMLFormElement>) => {
    事件.preventDefault();
    if (!编辑图书) {
      return;
    }

    set保存中(true);
    set弹窗错误('');

    try {
      const 响应 = await axios.put<图书更新响应>(`${API_BASE}/books/${编辑图书.id}`, {
        ...表单,
        publication_year: 表单.publication_year ? Number(表单.publication_year) : null,
        edition: 表单.edition ? Number(表单.edition) : null,
      });
      set提示信息(响应.data.message || '图书信息修改成功。');
      set编辑图书(null);
      await 加载图书列表(页码, 查询ID);
    } catch (错误) {
      let 错误信息 = '图书信息修改失败，请稍后重试。';
      if (axios.isAxiosError(错误)) {
        const 响应数据 = 错误.response?.data as { error?: string; message?: string } | undefined;
        错误信息 = 响应数据?.error || 响应数据?.message || 错误.message || 错误信息;
      }
      set弹窗错误(错误信息);
    } finally {
      set保存中(false);
    }
  };

  return (
    <main style={{ width: '100%', maxWidth: '1400px', padding: '24px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '10px' }}>图书信息维护</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        图书始终按原始入库时间倒序排列，修改基本信息不会改变排列顺序。
      </p>

      <form
        onSubmit={提交ID搜索}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '18px',
        }}
      >
        <label htmlFor="图书ID" style={{ fontWeight: 600 }}>按 ID 搜索：</label>
        <input
          id="图书ID"
          type="number"
          min="1"
          value={ID输入}
          onChange={(事件) => setID输入(事件.target.value)}
          placeholder="输入图书 ID"
          style={{ width: '180px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button type="submit" style={{ padding: '8px 16px', cursor: 'pointer' }}>搜索</button>
        <button type="button" onClick={清除ID搜索} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          显示全部
        </button>
        {查询ID && <span style={{ color: '#475569' }}>当前仅显示 ID：{查询ID}</span>}
      </form>

      {提示信息 && (
        <div
          role="status"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            border: '1px solid #abefc6',
            borderRadius: '6px',
            color: '#18794e',
            backgroundColor: '#ecfdf3',
          }}
        >
          {提示信息}
        </div>
      )}

      {页面错误 && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '12px 14px',
            border: '1px solid #fda29b',
            borderRadius: '6px',
            color: '#b42318',
            backgroundColor: '#fef3f2',
          }}
        >
          {页面错误}
        </div>
      )}

      <div style={{ marginBottom: '10px', color: '#64748b' }}>
        共 {分页.total} 本图书
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse', backgroundColor: '#fff' }}>
          <thead style={{ backgroundColor: '#f1f5f9' }}>
            <tr>
              <th style={表头样式}>ID</th>
              <th style={表头样式}>书名</th>
              <th style={表头样式}>作者</th>
              <th style={表头样式}>出版社</th>
              <th style={表头样式}>出版时间</th>
              <th style={表头样式}>格式</th>
              <th style={表头样式}>入库时间</th>
              <th style={表头样式}>操作</th>
            </tr>
          </thead>
          <tbody>
            {加载中 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  正在加载...
                </td>
              </tr>
            ) : 图书列表.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  没有找到图书
                </td>
              </tr>
            ) : (
              图书列表.map((图书) => (
                <tr key={图书.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ ...单元格样式, textAlign: 'center' }}>{图书.id}</td>
                  <td style={单元格样式} title={图书.title || '-'}>{图书.title || '-'}</td>
                  <td style={单元格样式} title={图书.author || '-'}>{图书.author || '-'}</td>
                  <td style={单元格样式} title={图书.publisher || '-'}>{图书.publisher || '-'}</td>
                  <td style={单元格样式}>{图书.publication_year || '-'}</td>
                  <td style={单元格样式}>{图书.file_format || '-'}</td>
                  <td style={单元格样式}>{格式化入库时间(图书.created_at)}</td>
                  <td style={{ ...单元格样式, whiteSpace: 'nowrap' }}>
                    <a
                      href={构建阅读链接(图书)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={打开按钮样式}
                    >
                      打开
                    </a>
                    <button
                      type="button"
                      onClick={() => 打开修改弹窗(图书)}
                      style={修改按钮样式}
                    >
                      修改
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {分页.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '18px' }}>
          <button
            type="button"
            disabled={页码 <= 1 || 加载中}
            onClick={() => set页码(页码 - 1)}
            style={分页按钮样式}
          >
            上一页
          </button>
          <span>第 {分页.page} / {分页.total_pages} 页</span>
          <button
            type="button"
            disabled={页码 >= 分页.total_pages || 加载中}
            onClick={() => set页码(页码 + 1)}
            style={分页按钮样式}
          >
            下一页
          </button>
        </div>
      )}

      {编辑图书 && (
        <div
          onMouseDown={(事件) => {
            if (事件.target === 事件.currentTarget) {
              关闭修改弹窗();
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="修改图书标题"
            style={{
              width: '100%',
              maxWidth: '860px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '22px',
              borderRadius: '10px',
              backgroundColor: '#fff',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.28)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
              <div>
                <h2 id="修改图书标题" style={{ marginBottom: '4px' }}>修改图书信息</h2>
                <div style={{ color: '#64748b', overflowWrap: 'anywhere' }}>
                  ID {编辑图书.id}：{编辑图书.title || '未命名图书'}
                </div>
              </div>
              <button
                type="button"
                onClick={关闭修改弹窗}
                disabled={保存中}
                style={{ alignSelf: 'flex-start', padding: '6px 10px', cursor: 'pointer' }}
              >
                关闭
              </button>
            </div>

            <form onSubmit={提交修改}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '14px',
                }}
              >
                {单行字段.map((字段) => (
                  <label key={字段.键} style={{ display: 'grid', gap: '6px', fontWeight: 600 }}>
                    {字段.标签}
                    <input
                      name={字段.键}
                      type={字段.类型 || 'text'}
                      value={表单[字段.键]}
                      onChange={处理字段变化}
                      style={输入框样式}
                    />
                  </label>
                ))}
              </div>

              <label style={{ display: 'grid', gap: '6px', marginTop: '14px', fontWeight: 600 }}>
                内容简介
                <textarea
                  name="description"
                  value={表单.description}
                  onChange={处理字段变化}
                  rows={6}
                  style={{ ...输入框样式, resize: 'vertical' }}
                />
              </label>

              {弹窗错误 && (
                <div
                  role="alert"
                  style={{
                    marginTop: '14px',
                    padding: '10px 12px',
                    border: '1px solid #fda29b',
                    borderRadius: '6px',
                    color: '#b42318',
                    backgroundColor: '#fef3f2',
                  }}
                >
                  {弹窗错误}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={关闭修改弹窗} disabled={保存中} style={分页按钮样式}>
                  取消
                </button>
                <button
                  type="submit"
                  disabled={保存中}
                  style={{
                    padding: '9px 18px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: 保存中 ? '#93c5fd' : '#2563eb',
                    color: '#fff',
                    cursor: 保存中 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {保存中 ? '正在保存...' : '保存修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

const 表头样式: React.CSSProperties = {
  padding: '11px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const 单元格样式: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'top',
  maxWidth: '300px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const 输入框样式: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  border: '1px solid #cbd5e1',
  borderRadius: '4px',
  font: 'inherit',
};

const 打开按钮样式: React.CSSProperties = {
  display: 'inline-block',
  marginRight: '10px',
  color: '#2563eb',
  textDecoration: 'none',
};

const 修改按钮样式: React.CSSProperties = {
  padding: '5px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
};

const 分页按钮样式: React.CSSProperties = {
  padding: '8px 14px',
  border: '1px solid #cbd5e1',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
};

export default 修改图书;

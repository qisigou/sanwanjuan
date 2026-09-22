import React, { useRef, useState } from 'react';
import axios from 'axios';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

type 导入状态 = 'imported' | 'duplicate' | 'failed';
type 提示类型 = 'success' | 'warning' | 'error';

interface 导入结果 {
  file_name: string;
  status: 导入状态;
  book_id?: number;
  format?: string;
  md5?: string;
  storage_location?: string;
  storage_file_name?: string;
  existing_book_id?: number;
  existing_storage_location?: string;
  existing_storage_file_name?: string;
  error?: string;
  rollback_error?: string;
}

interface 导入摘要 {
  total: number;
  imported_count: number;
  duplicate_count: number;
  failed_count: number;
  imported: 导入结果[];
  duplicates: 导入结果[];
  failed: 导入结果[];
}

interface 保存失败结果 {
  original_name: string;
  error: string;
}

interface 上传响应 {
  success: boolean;
  message?: string;
  error?: string;
  files?: Array<{ original_name: string; saved_name: string }>;
  import?: 导入摘要;
  failed?: 保存失败结果[];
  unsupported_files?: string[];
}

const 状态文字: Record<导入状态, string> = {
  imported: '已入库',
  duplicate: '重复',
  failed: '失败',
};

const 状态颜色: Record<导入状态, { 背景: string; 文字: string }> = {
  imported: { 背景: '#dcfce7', 文字: '#166534' },
  duplicate: { 背景: '#fef3c7', 文字: '#92400e' },
  failed: { 背景: '#fee2e2', 文字: '#991b1b' },
};

const 提示样式: Record<提示类型, React.CSSProperties> = {
  success: { color: '#18794e', backgroundColor: '#ecfdf3', borderColor: '#abefc6' },
  warning: { color: '#92400e', backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  error: { color: '#b42318', backgroundColor: '#fef3f2', borderColor: '#fda29b' },
};

const 上传文件: React.FC = () => {
  const [选中文件, set选中文件] = useState<File[]>([]);
  const [正在上传, set正在上传] = useState(false);
  const [正在扫描, set正在扫描] = useState(false);
  const [提示信息, set提示信息] = useState('');
  const [提示类别, set提示类别] = useState<提示类型>('success');
  const [导入摘要, set导入摘要] = useState<导入摘要 | null>(null);
  const [保存失败列表, set保存失败列表] = useState<保存失败结果[]>([]);
  const 文件输入 = useRef<HTMLInputElement>(null);
  const 正在处理 = 正在上传 || 正在扫描;

  const 清空反馈 = () => {
    set提示信息('');
    set导入摘要(null);
    set保存失败列表([]);
  };

  const 清空文件选择 = () => {
    set选中文件([]);
    if (文件输入.current) {
      文件输入.current.value = '';
    }
  };

  const 计算提示类别 = (数据: 上传响应): 提示类型 => {
    if (!数据.success || 数据.import?.failed_count || 数据.failed?.length) {
      return 'error';
    }
    if (数据.import?.duplicate_count) {
      return 'warning';
    }
    return 'success';
  };

  const 应用后端反馈 = (数据: 上传响应) => {
    set提示信息(数据.message || 数据.error || '处理完成。');
    set提示类别(计算提示类别(数据));
    set导入摘要(数据.import || null);
    set保存失败列表(数据.failed || []);
  };

  const 处理文件选择 = (事件: React.ChangeEvent<HTMLInputElement>) => {
    set选中文件(Array.from(事件.target.files || []));
    清空反馈();
  };

  const 处理文件上传 = async (事件: React.FormEvent<HTMLFormElement>) => {
    事件.preventDefault();

    if (选中文件.length === 0) {
      set提示信息('请先选择需要上传的文件。');
      set提示类别('error');
      return;
    }

    const 表单数据 = new FormData();
    选中文件.forEach((文件) => 表单数据.append('files', 文件));

    set正在上传(true);
    清空反馈();
    let 已交给后端 = false;

    try {
      const 响应 = await axios.post<上传响应>(`${API_BASE}/upload`, 表单数据);
      应用后端反馈(响应.data);
      已交给后端 = Boolean(响应.data.files || 响应.data.import);
    } catch (错误) {
      if (axios.isAxiosError(错误)) {
        const 响应数据 = 错误.response?.data as 上传响应 | undefined;
        if (响应数据) {
          应用后端反馈(响应数据);
          已交给后端 = Boolean(响应数据.files || 响应数据.import);
        } else {
          set提示信息(错误.message || '文件上传失败，请稍后再试。');
          set提示类别('error');
        }
      } else if (错误 instanceof Error) {
        set提示信息(错误.message);
        set提示类别('error');
      } else {
        set提示信息('文件上传失败，请稍后再试。');
        set提示类别('error');
      }
    } finally {
      set正在上传(false);
      if (已交给后端) {
        清空文件选择();
      }
    }
  };

  const 处理扫描临时文件夹 = async () => {
    set正在扫描(true);
    清空反馈();

    try {
      const 响应 = await axios.post<上传响应>(`${API_BASE}/import-temp`);
      应用后端反馈(响应.data);
    } catch (错误) {
      if (axios.isAxiosError(错误)) {
        const 响应数据 = 错误.response?.data as 上传响应 | undefined;
        应用后端反馈(响应数据 || {
          success: false,
          error: 错误.message || '扫描临时文件夹失败。',
        });
      } else {
        set提示信息(错误 instanceof Error ? 错误.message : '扫描临时文件夹失败。');
        set提示类别('error');
      }
    } finally {
      set正在扫描(false);
    }
  };

  const 渲染结果列表 = (标题: string, 结果列表: 导入结果[]) => {
    if (结果列表.length === 0) {
      return null;
    }

    return (
      <section style={{ marginTop: '18px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>{标题}</h3>
        <div style={{ display: 'grid', gap: '10px' }}>
          {结果列表.map((结果, 索引) => {
            const 状态样式 = 状态颜色[结果.status];

            return (
              <article
                key={`${结果.status}-${结果.file_name}-${索引}`}
                style={{
                  padding: '14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{结果.file_name}</strong>
                  <span
                    style={{
                      flexShrink: 0,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: 状态样式.背景,
                      color: 状态样式.文字,
                      fontSize: '13px',
                    }}
                  >
                    {状态文字[结果.status]}
                  </span>
                </div>

                {结果.status === 'imported' && (
                  <div style={{ marginTop: '8px', color: '#4b5563', fontSize: '14px' }}>
                    <div>数据库 ID：{结果.book_id}</div>
                    <div>文件格式：{结果.format}</div>
                    <div>存储位置：{结果.storage_location}</div>
                    <div>存储文件名：{结果.storage_file_name}</div>
                    {结果.md5 && <div style={{ overflowWrap: 'anywhere' }}>MD5：{结果.md5}</div>}
                  </div>
                )}

                {结果.status === 'duplicate' && (
                  <div style={{ marginTop: '8px', color: '#92400e', fontSize: '14px' }}>
                    <div>数据库中已有 ID：{结果.existing_book_id}</div>
                    <div>
                      已有文件：{结果.existing_storage_location} / {结果.existing_storage_file_name}
                    </div>
                    <div>临时文件未移动，可确认后自行处理。</div>
                    {结果.md5 && <div style={{ overflowWrap: 'anywhere' }}>MD5：{结果.md5}</div>}
                  </div>
                )}

                {结果.status === 'failed' && (
                  <div style={{ marginTop: '8px', color: '#b42318', fontSize: '14px' }}>
                    <div>失败原因：{结果.error || '未知错误'}</div>
                    {结果.rollback_error && <div>回滚异常：{结果.rollback_error}</div>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <main style={{ width: '100%', maxWidth: '1000px', padding: '24px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '12px' }}>上传文件</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        支持 PDF 和 EPUB 文件。上传后将立即采集信息、检查重复并归档到图书存储位置。
      </p>

      <form onSubmit={处理文件上传}>
        <div
          style={{
            padding: '24px',
            border: '1px dashed #999',
            borderRadius: '8px',
            backgroundColor: '#fff',
          }}
        >
          <input
            ref={文件输入}
            type="file"
            accept=".pdf,.epub"
            multiple
            disabled={正在处理}
            onChange={处理文件选择}
            style={{ width: '100%' }}
          />
        </div>

        {选中文件.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <strong>已选择 {选中文件.length} 个文件：</strong>
            <ul style={{ marginTop: '8px', paddingLeft: '24px', color: '#555' }}>
              {选中文件.map((文件) => (
                <li key={`${文件.name}-${文件.lastModified}`}>{文件.name}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={正在处理 || 选中文件.length === 0}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: 正在处理 || 选中文件.length === 0 ? '#9ca3af' : '#007bff',
            color: '#fff',
            cursor: 正在处理 || 选中文件.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {正在上传 ? '正在上传并入库...' : '上传并入库'}
        </button>
      </form>

      <section
        style={{
          marginTop: '24px',
          padding: '18px',
          border: '1px solid #dbeafe',
          borderRadius: '8px',
          backgroundColor: '#eff6ff',
        }}
      >
        <strong>处理临时文件夹中的已有文件</strong>
        <p style={{ margin: '6px 0 12px', color: '#475569', fontSize: '14px' }}>
          扫描临时文件夹中的所有 PDF 和 EPUB 文件，按相同规则进行去重、入库和归档。
        </p>
        <button
          type="button"
          disabled={正在处理}
          onClick={处理扫描临时文件夹}
          style={{
            padding: '9px 16px',
            border: '1px solid #2563eb',
            borderRadius: '4px',
            backgroundColor: 正在处理 ? '#bfdbfe' : '#2563eb',
            color: 正在处理 ? '#64748b' : '#fff',
            cursor: 正在处理 ? 'not-allowed' : 'pointer',
          }}
        >
          {正在扫描 ? '正在扫描并入库...' : '扫描临时文件夹并入库'}
        </button>
      </section>

      {提示信息 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: '20px',
            padding: '12px 14px',
            border: '1px solid',
            borderRadius: '6px',
            ...提示样式[提示类别],
          }}
        >
          {提示信息}
        </div>
      )}

      {导入摘要 && (
        <section style={{ marginTop: '20px' }}>
          <h2 style={{ fontSize: '19px', marginBottom: '12px' }}>处理结果</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#dcfce7', color: '#166534' }}>
              <div style={{ fontSize: '13px' }}>成功入库</div>
              <strong style={{ fontSize: '24px' }}>{导入摘要.imported_count}</strong>
            </div>
            <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#fef3c7', color: '#92400e' }}>
              <div style={{ fontSize: '13px' }}>重复文件</div>
              <strong style={{ fontSize: '24px' }}>{导入摘要.duplicate_count}</strong>
            </div>
            <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b' }}>
              <div style={{ fontSize: '13px' }}>处理失败</div>
              <strong style={{ fontSize: '24px' }}>{导入摘要.failed_count}</strong>
            </div>
          </div>

          {渲染结果列表('成功入库', 导入摘要.imported)}
          {渲染结果列表('重复文件', 导入摘要.duplicates)}
          {渲染结果列表('处理失败', 导入摘要.failed)}
        </section>
      )}

      {保存失败列表.length > 0 && (
        <section style={{ marginTop: '20px' }}>
          <h2 style={{ fontSize: '19px', marginBottom: '12px' }}>上传保存失败</h2>
          <div style={{ display: 'grid', gap: '10px' }}>
            {保存失败列表.map((结果, 索引) => (
              <article
                key={`${结果.original_name}-${索引}`}
                style={{
                  padding: '14px',
                  border: '1px solid #fda29b',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                }}
              >
                <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{结果.original_name}</strong>
                <div style={{ marginTop: '6px', color: '#b42318', fontSize: '14px' }}>
                  {结果.error}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
};

export default 上传文件;

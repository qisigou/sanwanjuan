import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AI图书助手 from './AI图书助手';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

const Pdf阅读器: React.FC = () => {
  const { bookID } = useParams<{ bookID: string }>();
  const [书名, 设置书名] = useState('PDF 阅读');
  const 阅读区引用 = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!bookID) return;
    let 已取消 = false;
    void fetch(`${API_BASE}/books?id=${bookID}&page=1&per_page=1`)
      .then((响应) => 响应.json())
      .then((数据) => {
        if (已取消) return;
        const 图书 = Array.isArray(数据.data) ? 数据.data[0] : null;
        if (图书?.title) 设置书名(图书.title);
      })
      .catch(() => {
        // 标题加载失败不影响 PDF 阅读和 AI 录入。
      });
    return () => {
      已取消 = true;
    };
  }, [bookID]);

  useEffect(() => {
    document.title = 书名;
  }, [书名]);

  if (!bookID) {
    return <div style={{ padding: 24 }}>未提供图书 ID</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 20px',
        borderBottom: '1px solid #ddd',
        backgroundColor: '#f5f5f5',
        flexShrink: 0,
      }}>
        <h3 style={{ margin: 0, color: '#333', fontSize: '1.2rem' }}>{书名}</h3>
        <a
          href={`${API_BASE}/search-id?bookID=${bookID}&download=1`}
          style={{ color: '#2563eb', fontSize: 13, textDecoration: 'none' }}
        >
          下载原文件
        </a>
      </div>

      <div style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <iframe
          ref={阅读区引用}
          title={`${书名} PDF 阅读器`}
          src={`${API_BASE}/search-id?bookID=${bookID}`}
          style={{ flex: 1, minWidth: 0, border: 'none', backgroundColor: '#525659' }}
        />
        <AI图书助手 bookID={Number(bookID)} 页面类型="PDF" 阅读区引用={阅读区引用} />
      </div>
    </div>
  );
};

export default Pdf阅读器;

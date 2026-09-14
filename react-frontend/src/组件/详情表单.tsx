import React from 'react';
import { 搜索结果元项 } from '../类型定义';

// 
const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

interface 数据表单属性 {
  results: 搜索结果元项[];
  total: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  onPageChange: (page: number) => void;
}

// 根据文件格式生成打开链接：epub 进入阅读器，其它格式（如 PDF）由浏览器直接打开
const 构建_打开链接 = (item: 搜索结果元项): string => {
  const 格式 = (item.文件格式 || '').toUpperCase();
  if (格式 === 'EPUB') {
    return `/epub_reader/${item.id}`;
  }
  return `${API_BASE}/search-id?bookID=${item.id}`;
};

// 固定表头高度，避免内容变化导致页面重新布局
const 表头样式: React.CSSProperties = {
  padding: '8px 6px',
  border: '1px solid #ddd',
  height: '38px',
  fontSize: '14px',
  whiteSpace: 'nowrap',
};

// 普通单元格固定高度，超长单行内容以省略号显示
const 单元格样式: React.CSSProperties = {
  padding: '8px 6px',
  border: '1px solid #ddd',
  height: '40px',
  fontSize: '14px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const 表格容器样式: React.CSSProperties = {
  width: '100%',
  overflowX: 'auto',
  border: '1px solid #ddd',
  borderRadius: '4px',
  marginBottom: '20px',
};

const 自动展开单元格样式: React.CSSProperties = {
  height: 'auto',
  minHeight: '40px',
  overflow: 'visible',
  textOverflow: 'clip',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: '20px',
  verticalAlign: 'top',
};

const 下载按钮样式: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  backgroundColor: '#28a745',
  color: 'white',
  border: 'none',
  borderRadius: '3px',
  fontSize: '12px',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const 详情表单: React.FC<数据表单属性> = ({ 
  results, 
  total,
  currentPage,
  totalPages,
  perPage,
  onPageChange,
}) => {
  return (
    <div>
      { 
        <>
          <div style={表格容器样式}>
          <table style={{ width: '100%', minWidth: '700px', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              <col />
              <col />
              <col style={{ width: 88 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 62 }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={表头样式}>编号</th>
                <th style={表头样式}>书名</th>
                <th style={表头样式}>作者</th>
                <th style={表头样式}>出版社</th>
                <th style={表头样式}>出版时间</th>
                <th style={表头样式}>打开</th>
                <th style={表头样式}>操作</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr key={item.id}>
                  <td style={{ ...单元格样式, textAlign: 'center' }}>
                    {(currentPage - 1) * perPage + index + 1}
                  </td>
                  <td style={{ ...单元格样式, ...自动展开单元格样式 }} title={item.书名 ?? '-'}>
                    {item.书名 ?? '-'}
                  </td>
                  <td style={{ ...单元格样式, ...自动展开单元格样式 }} title={item.作者 ?? '-'}>
                    {item.作者 ?? '-'}
                  </td>
                  <td style={单元格样式}>{item.出版社 ?? '-'}</td>
                  <td style={{ ...单元格样式, textAlign: 'center' }}>{item.出版时间 ?? '-'}</td>
                  <td style={单元格样式}>
                    <a href={构建_打开链接(item)} target="_blank" rel="noopener noreferrer">
                      {item.文件格式 ?? '-'}
                    </a>
                  </td>
                  <td style={{ ...单元格样式, textAlign: 'center' }}>
                    <a
                      href={`${API_BASE}/search-id?bookID=${item.id}&download=1`}
                      download
                      style={下载按钮样式}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#218838';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#28a745';
                      }}
                    >
                      下载
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '5px', position: 'sticky', bottom: 0, backgroundColor: '#fff', padding: '8px 0', zIndex: 1 }}>
              <button 
                onClick={() => onPageChange(1)} 
                disabled={currentPage === 1}
                style={{ padding: '5px 10px' }}
              >
                首页
              </button>
              <button 
                onClick={() => onPageChange(currentPage - 1)} 
                disabled={currentPage === 1}
                style={{ padding: '5px 10px' }}
              >
                上一页
              </button>
              
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    disabled={currentPage === pageNum}
                    style={{ 
                      padding: '5px 10px',
                      backgroundColor: currentPage === pageNum ? '#ddd' : 'inherit'
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button 
                onClick={() => onPageChange(currentPage + 1)} 
                disabled={currentPage === totalPages}
                style={{ padding: '5px 10px' }}
              >
                下一页
              </button>
              <button 
                onClick={() => onPageChange(totalPages)} 
                disabled={currentPage === totalPages}
                style={{ padding: '5px 10px' }}
              >
                末页
              </button>
            </div>
          )}
          
        </>
      }
    </div>
  );
};

export default 详情表单;

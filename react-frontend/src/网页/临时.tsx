import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL; // 来自 /src/类型定义/全局变量.d.ts
const 临时: React.FC = () => {
  const [sql, setSql] = useState('SELECT id,书名,作者,ai评估,文件格式 FROM 书籍 WHERE 存储状态="正常"');
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [currentSql, setCurrentSql] = useState('');
  
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(1000);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [jumpPage, setJumpPage] = useState('');

  // 新增：控制单元格展开/折叠的状态
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = '高级SQL';
  }, []);

  const executeQuery = async (sqlText: string, page: number = 1) => {
    const response = await axios.post(`${API_BASE}/query`, { 
      sql: sqlText,
      page: page,
      page_size: pageSize
    });
    return response.data;
  };

  const softDelete = async (idValue: any) => {
    const response = await fetch(`${API_BASE}/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: idValue }),
    });
    return await response.json();
  };

  const loadPage = async (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages && totalPages > 0) page = totalPages;
    
    setLoading(true);
    setMessage('');
    // 切换页面时清空展开状态
    setExpandedCells(new Set());
    
    try {
      const result = await executeQuery(sql, page);
      
      if (result.success) {
        setColumns(result.columns || []);
        setRows(result.rows || []);
        setCurrentSql(sql);
        setCurrentPage(result.pagination.page);
        setTotalCount(result.pagination.total);
        setTotalPages(result.pagination.total_pages);
        setJumpPage('');
        setMessage(`成功加载 ${result.rows?.length} 条记录 (共 ${result.pagination.total} 条)`);
      } else {
        setMessage(`错误: ${result.error}`);
      }
    } catch (err: any) {
      setMessage(`请求失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setCurrentPage(1);
    setExpandedCells(new Set());
    await loadPage(1);
  };

  const handleDelete = async (row: any[], idColumn: string = 'id') => {
    console.log(' 开始删除', { row, idColumn });
    const idIndex = columns.indexOf(idColumn);
    const idValue = row[idIndex];
    const rowIndex = rows.findIndex(r => r[idIndex] === idValue);
    
    setLoading(true);
    
    try {
      const result = await softDelete(idValue);
      
      if (result.success) {
        setRows(prevRows => prevRows.filter((_, idx) => idx !== rowIndex));
        setTotalCount(prev => prev - 1);
        
        if (rows.length === 1 && currentPage > 1) {
          const newTotalPages = Math.ceil((totalCount - 1) / pageSize);
          if (currentPage > newTotalPages) {
            loadPage(currentPage - 1);
          } else {
            setTotalPages(newTotalPages);
          }
        } else {
          const newTotalPages = Math.ceil((totalCount - 1) / pageSize);
          setTotalPages(newTotalPages);
        }
        
        setMessage(`删除成功：${result.message}`);
      } else {
        setMessage(`删除失败: ${result.message || result.error}`);
      }
    } catch (err: any) {
      setMessage(`删除请求失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
    console.log('✅ 删除完成，当前行数:', rows.length - 1);
    console.log('📊 当前缓存页:', currentPage);
  };

  // 切换单元格展开/折叠
  const toggleCellExpand = (cellKey: string) => {
    setExpandedCells(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cellKey)) {
        newSet.delete(cellKey);
      } else {
        newSet.add(cellKey);
      }
      return newSet;
    });
  };

  const isFileFormatColumn = (columnName: string): boolean => {
    return columnName === '文件格式';
  };

  // 判断单元格内容是否需要折叠（超过50个字符）
  const shouldTruncate = (content: string): boolean => {
    return content.length > 50;
  };

  // 渲染单元格内容
  const renderCellContent = (cell: any, columnName: string, idValue: any, rowIndex: number, colIndex: number) => {
    const cellKey = `${rowIndex}-${colIndex}`;
    const isExpanded = expandedCells.has(cellKey);
    
    if (isFileFormatColumn(columnName)) {
      const fileFormat = cell !== null ? String(cell) : '-';
      const 格式大写 = String(cell || '').toUpperCase();
      const 打开链接 = 格式大写 === 'EPUB'
        ? `/epub_reader/${idValue}`
        : `/pdf_reader/${idValue}`;
      return (
        <a 
          href={打开链接} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            color: '#007bff',
            textDecoration: 'none',
            cursor: 'pointer',
            display: 'inline-block'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          {fileFormat}
        </a>
      );
    }
    
    const content = cell !== null ? String(cell) : 'NULL';
    const needsTruncate = shouldTruncate(content);
    
    if (!needsTruncate) {
      return <span>{content}</span>;
    }
    
    return (
      <div style={{ position: 'relative' }}>
        <span>
          {isExpanded ? content : content.substring(0, 50) + '...'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCellExpand(cellKey);
          }}
          style={{
            marginLeft: '6px',
            padding: '2px 8px',
            fontSize: '11px',
            border: '1px solid #ddd',
            borderRadius: '3px',
            backgroundColor: '#f8f9fa',
            cursor: 'pointer',
            color: '#666',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e9ecef';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
          }}
        >
          {isExpanded ? '收起' : '展开'}
        </button>
      </div>
    );
  };

  // 生成页码按钮
  const renderPageButtons = () => {
    const buttons = [];
    const maxVisible = 7;
    
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, currentPage + 3);
    
    if (endPage - startPage < maxVisible - 1) {
      if (startPage === 1) {
        endPage = Math.min(totalPages, startPage + maxVisible - 1);
      } else if (endPage === totalPages) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }
    }
    
    if (startPage > 1) {
      buttons.push(
        <button key="first" onClick={() => loadPage(1)} style={pageButtonStyle}>
          首页
        </button>
      );
      if (startPage > 2) {
        buttons.push(<span key="ellipsis1" style={{ margin: '0 5px' }}>…</span>);
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <button
          key={i}
          onClick={() => loadPage(i)}
          style={{
            ...pageButtonStyle,
            backgroundColor: i === currentPage ? '#007bff' : 'white',
            color: i === currentPage ? 'white' : '#333',
            fontWeight: i === currentPage ? 'bold' : 'normal'
          }}
        >
          {i}
        </button>
      );
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        buttons.push(<span key="ellipsis2" style={{ margin: '0 5px' }}>…</span>);
      }
      buttons.push(
        <button key="last" onClick={() => loadPage(totalPages)} style={pageButtonStyle}>
          末页
        </button>
      );
    }
    
    return buttons;
  };

  const pageButtonStyle = {
    padding: '5px 10px',
    margin: '0 2px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  };

  const handleJump = () => {
    const page = parseInt(jumpPage);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      loadPage(page);
    } else {
      setMessage(`请输入 1 到 ${totalPages} 之间的页码`);
    }
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '1800px',
      margin: '0 auto',
      padding: '20px'
    }}>
      <h3>SQLite 数据库管理器，仅支持 SELECT</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={6}
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: '14px',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '10px'
          }}
          placeholder="输入 SQL 语句..."
        />
        <button
          onClick={handleExecute}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? '执行中...' : '执行 SQL'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: message.includes('成功') ? '#d4edda' : '#f8d7da',
          color: message.includes('成功') ? '#155724' : '#721c24',
          border: message.includes('成功') ? '1px solid #c3e6cb' : '1px solid #f5c6cb'
        }}>
          {message}
        </div>
      )}

      {columns.length > 0 && rows.length > 0 && (
        <>
          <div style={{ 
            maxHeight: '600px', 
            overflow: 'auto',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              tableLayout: 'auto' // 关键：根据内容自动调整列宽
            }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  {columns.map((col, idx) => (
                    <th key={idx} style={{
                      border: '1px solid #ddd',
                      padding: '8px 12px',
                      textAlign: 'left',
                      backgroundColor: '#f2f2f2',
                      fontWeight: 'bold',
                      position: 'sticky',
                      top: 0,
                      whiteSpace: 'nowrap',
                      minWidth: '60px',
                      maxWidth: '300px' // 限制列宽，避免某些列过宽
                    }}>{col}</th>
                  ))}
                  <th style={{
                    border: '1px solid #ddd',
                    padding: '8px 12px',
                    textAlign: 'center',
                    backgroundColor: '#f2f2f2',
                    fontWeight: 'bold',
                    position: 'sticky',
                    top: 0,
                    whiteSpace: 'nowrap',
                    width: '100px',
                    minWidth: '100px'
                  }}>下载</th>
                  <th style={{
                    border: '1px solid #ddd',
                    padding: '8px 12px',
                    textAlign: 'center',
                    backgroundColor: '#f2f2f2',
                    fontWeight: 'bold',
                    position: 'sticky',
                    top: 0,
                    whiteSpace: 'nowrap',
                    width: '100px',
                    minWidth: '100px'
                  }}>删除</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const idColumn = columns.includes('id') ? 'id' : columns[0];
                  const idIndex = columns.indexOf(idColumn);
                  const idValue = row[idIndex];
                  
                  return (
                    <tr key={rowIdx} style={{
                      backgroundColor: rowIdx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} style={{
                          border: '1px solid #ddd',
                          padding: '8px 12px',
                          textAlign: 'left',
                          maxWidth: '300px',
                          wordBreak: 'break-word',
                          verticalAlign: 'top'
                        }}>
                          {renderCellContent(cell, columns[colIdx], idValue, rowIdx, colIdx)}
                        </td>
                      ))}
                      <td style={{
                        border: '1px solid #ddd',
                        padding: '8px 12px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        width: '100px',
                        minWidth: '100px'
                      }}>
                        <a
                          href={`${API_BASE}/search-id?bookID=${idValue}&download=1`}
                          download
                          style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            fontSize: '12px',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                          }}
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
                      <td style={{
                        border: '1px solid #ddd',
                        padding: '8px 12px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        width: '100px',
                        minWidth: '100px'
                      }}>
                        <button
                          onClick={() => handleDelete(row, idColumn)}
                          disabled={loading}
                          style={{
                            padding: '4px 12px',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#c82333';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#dc3545';
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* 分页控件保持不变 */}
          <div style={{ 
            marginTop: '15px', 
            padding: '10px 15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ fontSize: '14px' }}>
              共 <strong>{totalCount}</strong> 条记录，第 <strong>{currentPage}</strong> / <strong>{totalPages}</strong> 页
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <button
                onClick={() => loadPage(1)}
                disabled={currentPage <= 1 || loading}
                style={{
                  ...pageButtonStyle,
                  backgroundColor: currentPage <= 1 || loading ? '#e9ecef' : 'white',
                  cursor: currentPage <= 1 || loading ? 'not-allowed' : 'pointer'
                }}
              >
                首页
              </button>
              
              <button
                onClick={() => loadPage(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                style={{
                  ...pageButtonStyle,
                  backgroundColor: currentPage <= 1 || loading ? '#e9ecef' : 'white',
                  cursor: currentPage <= 1 || loading ? 'not-allowed' : 'pointer'
                }}
              >
                上一页
              </button>
              
              {renderPageButtons()}
              
              <button
                onClick={() => loadPage(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                style={{
                  ...pageButtonStyle,
                  backgroundColor: currentPage >= totalPages || loading ? '#e9ecef' : 'white',
                  cursor: currentPage >= totalPages || loading ? 'not-allowed' : 'pointer'
                }}
              >
                下一页
              </button>
              
              <button
                onClick={() => loadPage(totalPages)}
                disabled={currentPage >= totalPages || loading}
                style={{
                  ...pageButtonStyle,
                  backgroundColor: currentPage >= totalPages || loading ? '#e9ecef' : 'white',
                  cursor: currentPage >= totalPages || loading ? 'not-allowed' : 'pointer'
                }}
              >
                末页
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '14px' }}>跳转至</span>
              <input
                type="number"
                min="1"
                max={totalPages}
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleJump();
                  }
                }}
                style={{
                  width: '60px',
                  padding: '4px 6px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px',
                  textAlign: 'center'
                }}
              />
              <span style={{ fontSize: '14px' }}>页</span>
              <button
                onClick={handleJump}
                disabled={loading}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #007bff',
                  borderRadius: '4px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                跳转
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default 临时;

// 搜索结果.tsx
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { 搜索响应, 搜索结果元项 } from '../类型定义';
import 详情表单 from '../组件/详情表单';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;
const 搜索请求后端地址 = `${API_BASE}/search-all`;
const 搜索结果: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // 直接从URL参数获取查询词、页码和每页数量
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const perPage = parseInt(searchParams.get('perPage') || '50', 10);

  // 使用 React Query 管理搜索
  const { 
    data, 
    isLoading, 
    isError,
    isFetching,
  
  } = useQuery({
      //配置项
      enabled: !!query.trim(),
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    queryKey: ['search', query, page, perPage],
    queryFn: async (): Promise<搜索响应> => {
      if (!query.trim()) {
        return {
        query: query, // 即使为空字符串也要包含
        page: page,
        per_page: perPage,
        total: 0,
        total_pages: 0,
        data: []};
      }
      
      const res = await axios.get<搜索响应>(搜索请求后端地址, {
        params: { 
          q: query.trim(), 
          page,
          per_page: perPage
        },
      });
      return res.data;
    }
  
  });

  // 处理分页变化 - 更新URL参数
  const handlePageChange = (newPage: number) => {
    if (newPage !== page) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('page', newPage.toString());
      setSearchParams(newParams, { replace: true });
    }
  };

  // 处理每页数量变化
  const handlePerPageChange = (newPerPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('perPage', newPerPage.toString());
    newParams.set('page', '1'); // 重置到第一页
    setSearchParams(newParams, { replace: true });
  };

  const results: 搜索结果元项[] = data?.data || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / perPage) || 1;

  return (
    <div style={{ width: '100%', maxWidth: '1400px', padding: '20px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h4>搜索词: <span style={{ color: "red" }}>{query}</span></h4>
        <span style={{ color: '#0f0f0fff', fontSize: '14px' }}>
        （共 {total} 条结果）
      </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>每页显示:</span>
          {[20, 50, 100].map((size) => (
            <button
              key={size}
              onClick={() => handlePerPageChange(size)}
              style={{
                padding: '5px 10px',
                backgroundColor: perPage === size ? '#ddd' : 'transparent',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      
      {isLoading  ? (
        <div>加载中...</div>
      ) : isError ? (
        <div>搜索失败，请稍后再试</div>
      ) : (
        <>
          {isFetching && (
            <div style={{ position: 'fixed', top: '20px', right: '20px', padding: '10px', background: '#f8f8f8' }}>
              正在更新数据...
            </div>
          )}
          <详情表单
            results={results} 
            total={total}
            currentPage={page}
            totalPages={totalPages}
            perPage={perPage}
            onPageChange={handlePageChange}
          />

        </>
      )}
    </div>
  );
};

export default 搜索结果;

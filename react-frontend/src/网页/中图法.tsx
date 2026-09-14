import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import 中图法详情表单 from '../组件/中图法详情表单';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;
const 每页条数 = 20;

interface 分类节点 {
  分类号: string;
  分类名称: string;
  直接数量: number;
  汇总数量: number;
  有子节点: boolean;
}

interface 图书响应 {
  query: string;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  data: {
    id: number;
    书名: string | null;
    作者: string | null;
    出版社: string | null;
    出版时间: number | null;
    文件格式: string | null;
  }[];
}

const 获取子节点 = async (父分类号: string | null): Promise<分类节点[]> => {
  const 地址 = 父分类号
    ? `${API_BASE}/ztf/children?分类号=${encodeURIComponent(父分类号)}`
    : `${API_BASE}/ztf/children`;
  const 响应 = await axios.get(地址);
  return 响应.data.节点 || [];
};

const 分类树: React.FC<{
  父分类号: string | null;
  层级: number;
  展开集合: Set<string>;
  选中分类号: string | null;
  切换展开: (分类号: string) => void;
  选择: (节点: 分类节点) => void;
}> = ({ 父分类号, 层级, 展开集合, 选中分类号, 切换展开, 选择 }) => {
  const 子节点查询 = useQuery({
    queryKey: ['中图法子节点', 父分类号],
    queryFn: () => 获取子节点(父分类号),
  });

  if (子节点查询.isLoading) {
    return (
      <div style={{ padding: '2px 0', paddingLeft: 层级 * 20 + 24, color: '#888' }}>
        加载中...
      </div>
    );
  }
  if (子节点查询.isError) {
    return (
      <div style={{ padding: '2px 0', paddingLeft: 层级 * 20 + 24, color: '#c00' }}>
        加载失败
      </div>
    );
  }

  const 节点列表 = 子节点查询.data || [];

  return (
    <>
      {节点列表.map((节点) => {
        const 已展开 = 展开集合.has(节点.分类号);
        const 已选中 = 选中分类号 === 节点.分类号;
        return (
          <div key={节点.分类号}>
            <div
              onClick={() => 选择(节点)}
              style={{
                paddingLeft: 层级 * 20 + 4,
                paddingTop: 2,
                paddingBottom: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                borderRadius: 3,
                backgroundColor: 已选中 ? '#cfe2ff' : 'transparent',
              }}
            >
              {节点.有子节点 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    切换展开(节点.分类号);
                  }}
                  title={已展开 ? '收起' : '展开'}
                  style={{
                    width: 20,
                    height: 20,
                    padding: 0,
                    border: '1px solid #aaa',
                    borderRadius: 4,
                    backgroundColor: '#fff',
                    color: '#333',
                    fontSize: 14,
                    lineHeight: '18px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  {已展开 ? '−' : '+'}
                </button>
              ) : (
                <span style={{ width: 20, display: 'inline-block', flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 已选中 ? 'bold' : 'normal', color: '#333', whiteSpace: 'nowrap' }}>
                {节点.分类号} {节点.分类名称}
              </span>
              <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
                （{节点.汇总数量}）
              </span>
            </div>
            {已展开 && 节点.有子节点 && (
              <分类树
                父分类号={节点.分类号}
                层级={层级 + 1}
                展开集合={展开集合}
                选中分类号={选中分类号}
                切换展开={切换展开}
                选择={选择}
              />
            )}
          </div>
        );
      })}
    </>
  );
};

const 中图法页面: React.FC = () => {
  const [展开集合, set展开集合] = useState<Set<string>>(new Set());
  const [选中节点, set选中节点] = useState<分类节点 | null>(null);
  const [页码, set页码] = useState(1);

  const 切换展开 = (分类号: string) => {
    set展开集合((prev) => {
      const 新集合 = new Set(prev);
      if (新集合.has(分类号)) {
        新集合.delete(分类号);
      } else {
        新集合.add(分类号);
      }
      return 新集合;
    });
  };

  const 选择 = (节点: 分类节点) => {
    set选中节点(节点);
    set页码(1);
  };

  const 图书查询 = useQuery({
    queryKey: ['中图法图书', 选中节点?.分类号, 页码, 每页条数],
    queryFn: async (): Promise<图书响应> => {
      const 响应 = await axios.get(`${API_BASE}/ztf/books`, {
        params: { 分类号: 选中节点!.分类号, page: 页码, per_page: 每页条数 },
      });
      return 响应.data;
    },
    enabled: !!选中节点,
  });

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: 20,
        height: 'calc(100vh - 120px)',
        minHeight: 520,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      
      <div style={{ display: 'flex', gap: 20, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
        <div
          style={{
            width: 400,
            overflow: 'auto',
            border: '1px solid #ddd',
            borderRadius: 4,
            padding: 8,
            flexShrink: 0,
            backgroundColor: '#fafafa',
            minHeight: 0,
          }}
        >
          <分类树
            父分类号={null}
            层级={0}
            展开集合={展开集合}
            选中分类号={选中节点?.分类号 ?? null}
            切换展开={切换展开}
            选择={选择}
          />
        </div>
        <div style={{ width: 740, flexShrink: 0, minHeight: 0 }}>
          <div
            style={{
              height: '100%',
              overflow: 'auto',
              scrollbarGutter: 'stable',
              border: '1px solid #ddd',
              borderRadius: 4,
              padding: 12,
              backgroundColor: '#fff',
            }}
          >
            {选中节点 ? (
              <>
                <h4 style={{ marginTop: 0 }}>
                  {选中节点.分类号} {选中节点.分类名称}
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>
                    共 {图书查询.data?.total ?? 0} 本（含子分类）
                  </span>
                </h4>
                {图书查询.isLoading ? (
                  <div style={{ color: '#888' }}>加载中...</div>
                ) : 图书查询.isError ? (
                  <div style={{ color: '#c00' }}>加载失败，请稍后重试</div>
                ) : (
                  <中图法详情表单
                    results={图书查询.data?.data || []}
                    total={图书查询.data?.total || 0}
                    currentPage={图书查询.data?.page || 1}
                    totalPages={图书查询.data?.total_pages || 1}
                    perPage={每页条数}
                    onPageChange={set页码}
                  />
                )}
              </>
            ) : (
              <div style={{ color: '#888' }}>请点击左侧分类查看该分类下的图书</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default 中图法页面;

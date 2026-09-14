import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = window.__APP_CONFIG__.API_BASE_URL;

interface 专业条目 {
  编号: string;
  名称: string;
  备注: string;
  数量: number;
}

interface 门类条目 {
  编号: string;
  名称: string;
  备注: string;
  数量: number;
  专业: 专业条目[];
}

interface 学科统计响应 {
  成功: boolean;
  总数: number;
  已归类: number;
  未归类: number;
  门类: 门类条目[];
}

// 结构取自研究生教育学科专业目录，数量由后端按中图法近似映射统计
const 获取_学科统计 = async (): Promise<学科统计响应> => {
  const 响应 = await axios.get(`${API_BASE}/subject-stats`);
  return 响应.data;
};

const 表格样式: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  fontSize: 14,
};

const 表头样式: React.CSSProperties = {
  padding: '8px 6px',
  borderBottom: '2px solid #ddd',
  backgroundColor: '#f2f2f2',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  fontWeight: 'bold',
};

const 单元格样式: React.CSSProperties = {
  padding: '6px',
  borderBottom: '1px solid #eee',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const 展开按钮样式: React.CSSProperties = {
  width: 18,
  height: 18,
  padding: 0,
  marginRight: 4,
  border: '1px solid #aaa',
  borderRadius: 4,
  backgroundColor: '#fff',
  color: '#333',
  fontSize: 13,
  lineHeight: '16px',
  textAlign: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  userSelect: 'none',
  verticalAlign: 'middle',
};

const 小按钮样式: React.CSSProperties = {
  padding: '3px 10px',
  border: '1px solid #ccc',
  borderRadius: 4,
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

const 条状图底色样式: React.CSSProperties = {
  height: 12,
  backgroundColor: '#eef1f4',
  borderRadius: 6,
  overflow: 'hidden',
};

const 备注样式: React.CSSProperties = {
  marginLeft: 6,
  color: '#999',
  fontSize: 12,
};

// 条状图长度以本层最大数量为基准
const 数量条: React.FC<{ 数量: number; 最大: number; 次要?: boolean }> = ({ 数量, 最大, 次要 }) => (
  <div style={条状图底色样式} title={`${数量} 本`}>
    <div
      style={{
        width: `${(数量 / Math.max(1, 最大)) * 100}%`,
        height: '100%',
        backgroundColor: 次要 ? '#8fb8e0' : '#4a90d9',
        borderRadius: 6,
      }}
    />
  </div>
);

const 学科统计表: React.FC = () => {
  const [展开集合, set展开集合] = useState<Set<string>>(new Set());
  const [只看有藏书, set只看有藏书] = useState(false);

  const 统计查询 = useQuery({
    queryKey: ['学科统计'],
    queryFn: 获取_学科统计,
    staleTime: 5 * 60 * 1000,
  });

  if (统计查询.isLoading) {
    return <div style={{ color: '#888', padding: 12 }}>加载中...</div>;
  }

  const 数据 = 统计查询.data;
  if (统计查询.isError || !数据 || !数据.成功) {
    return <div style={{ color: '#c00', padding: 12 }}>学科统计加载失败，请稍后重试</div>;
  }

  const 门类列表 = 数据.门类;
  const 门类最大数量 = Math.max(1, ...门类列表.map((门类) => 门类.数量));
  const 全部展开 =
    门类列表.length > 0 && 门类列表.every((门类) => 展开集合.has(门类.编号));

  const 切换全部展开 = () => {
    set展开集合(全部展开 ? new Set() : new Set(门类列表.map((门类) => 门类.编号)));
  };

  const 切换单个展开 = (编号: string) => {
    set展开集合((前集合) => {
      const 新集合 = new Set(前集合);
      if (新集合.has(编号)) {
        新集合.delete(编号);
      } else {
        新集合.add(编号);
      }
      return 新集合;
    });
  };

  return (
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 4,
        backgroundColor: '#fff',
        padding: '4px 12px 12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          margin: '8px 0',
        }}
      >
        <span style={{ fontSize: 14, color: '#444' }}>
          共 {数据.总数} 本；已归类 {数据.已归类} 本，未归类 {数据.未归类} 本
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={只看有藏书}
              onChange={(事件) => set只看有藏书(事件.target.checked)}
            />
            只看有藏书的专业
          </label>
          <button onClick={切换全部展开} style={小按钮样式}>
            {全部展开 ? '收起全部' : '展开全部'}
          </button>
        </div>
      </div>

      <table style={表格样式}>
        <colgroup>
          <col style={{ width: 150 }} />
          <col />
          <col style={{ width: 72 }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={表头样式}>编号</th>
            <th style={表头样式}>学科分类</th>
            <th style={{ ...表头样式, textAlign: 'right' }}>藏书数量</th>
            <th style={表头样式}>数量分布</th>
          </tr>
        </thead>
        <tbody>
          {门类列表.map((门类) => {
            const 已展开 = 展开集合.has(门类.编号);
            const 全部专业 = [...门类.专业].sort(
              (甲, 乙) => 乙.数量 - 甲.数量 || 甲.编号.localeCompare(乙.编号)
            );
            const 专业列表 = 只看有藏书 ? 全部专业.filter((专业) => 专业.数量 > 0) : 全部专业;
            const 可展开 = 专业列表.length > 0;
            const 专业最大数量 = Math.max(1, ...专业列表.map((专业) => 专业.数量));
            return (
              <React.Fragment key={门类.编号}>
                <tr>
                  <td style={单元格样式} title={`${门类.编号} ${门类.名称}`}>
                    {可展开 ? (
                      <button
                        onClick={() => 切换单个展开(门类.编号)}
                        title={已展开 ? '收起二级专业' : '展开二级专业'}
                        style={展开按钮样式}
                      >
                        {已展开 ? '−' : '+'}
                      </button>
                    ) : (
                      <span style={{ display: 'inline-block', width: 22 }} />
                    )}
                    {门类.编号}
                  </td>
                  <td style={单元格样式} title={门类.名称}>
                    {门类.名称}
                  </td>
                  <td style={{ ...单元格样式, textAlign: 'right' }}>{门类.数量}</td>
                  <td style={单元格样式}>
                    <数量条 数量={门类.数量} 最大={门类最大数量} />
                  </td>
                </tr>
                {已展开 &&
                  专业列表.map((专业) => (
                    <tr key={专业.编号}>
                      <td
                        style={{ ...单元格样式, paddingLeft: 34 }}
                        title={`${专业.编号} ${专业.名称}`}
                      >
                        {专业.编号}
                      </td>
                      <td style={单元格样式} title={专业.名称}>
                        {专业.名称}
                        {专业.备注 ? <span style={备注样式}>{专业.备注}</span> : null}
                      </td>
                      <td style={{ ...单元格样式, textAlign: 'right' }}>{专业.数量}</td>
                      <td style={单元格样式}>
                        <数量条 数量={专业.数量} 最大={专业最大数量} 次要 />
                      </td>
                    </tr>
                  ))}
              </React.Fragment>
            );
          })}
          <tr>
            <td style={单元格样式}>
              <span style={{ display: 'inline-block', width: 22 }} />—
            </td>
            <td style={单元格样式}>未归类（中图法无对应专业）</td>
            <td style={{ ...单元格样式, textAlign: 'right' }}>{数据.未归类}</td>
            <td style={单元格样式}>
              <数量条 数量={数据.未归类} 最大={门类最大数量} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default 学科统计表;

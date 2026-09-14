import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom';

const 网页头 = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

const 函数_处理搜索提交事件 = (event: React.FormEvent) => {
  event.preventDefault(); // 阻止表单默认提交行为（页面刷新）
  
  // 只有当有搜索词时才进行导航
  if (searchQuery.trim()) {
    // 使用 navigate 跳转到搜索结果页，并携带搜索参数
    navigate(`/sou?q=${encodeURIComponent(searchQuery.trim())}&page=1&perPage=20`);
  }
};

  return (
    <header className="header" style={{ padding: '1rem 0' }}>
      <div className="header-content" style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 20px'
      }}>
        {/* Left-aligned links */}
        <nav>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/">首页</Link>
            <Link to="/shudan">书单</Link>
            <Link to="/zhongtufa">中图法</Link>
          </div>
        </nav>
        {/* Centered search bar */}
        <form 
          onSubmit={函数_处理搜索提交事件} // 表单提交时触发处理函数
          style={{ 
            width: '40%', 
            minWidth: '300px',
            margin: '0 auto',
            display: 'flex', // 改为弹性布局，让输入框和按钮在同一行
            gap: '0.5rem' // 添加间距
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} // 保留用于更新本地状态
            onKeyDown={(e) => {
              // 可选：支持回车键直接提交（符合用户习惯）
              if (e.key === 'Enter') {
                函数_处理搜索提交事件(e);
              }
            }}
            placeholder="搜索关键词..."
            style={{
              flex: 1, // 输入框占据剩余空间
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              outline: 'none'
            }}
          />
          <button
            type="submit" // 类型为submit，点击会触发表单的onSubmit
            disabled={!searchQuery.trim()} // 没有内容时禁用按钮
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid #007bff',
              backgroundColor: '#007bff',
              color: 'white',
              cursor: searchQuery.trim() ? 'pointer' : 'not-allowed',
              opacity: searchQuery.trim() ? 1 : 0.6
            }}
          >
            搜索
          </button>
        </form>

        {/* Right-aligned links */}
        <nav>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/about">关于</Link>
            <Link to="/shangchuan">上传</Link>
            <Link to="/xiugai">修改</Link>
            <Link to="/c">临时</Link>
          </div>
        </nav>
      </div>
    </header>
  )
}

export default 网页头

import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 关于 from './网页/关于';
import 临时 from './网页/临时'
import 搜索结果 from './网页/搜索结果';
import 中图法页面 from './网页/中图法';
import 上传文件页面 from './网页/上传文件';
import 修改图书页面 from './网页/修改图书';
import 网页头 from './组件/顶栏';
import 网页脚 from './组件/底栏';
import Epub阅读器 from './组件/Epub阅读器';
import 学科统计表 from './组件/学科统计表';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// 创建一个布局包装器组件
const LayoutWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isReaderRoute = location.pathname.startsWith('/epub_reader/');
  
  // 如果是阅读器路由，不显示顶栏和底栏
  if (isReaderRoute) {
    return <>{children}</>;
  }
  
  // 否则显示完整布局
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <网页头 />
      {children}
      {/*<网页脚/> */}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/epub_reader/:bookID" element={
            <div style={{ height: '100vh', width: '100vw' }}>
              <Epub阅读器 />
            </div>
          } />
          <Route path="*" element={
            <LayoutWrapper>
              <Routes>
                <Route path="/about" element={<关于 />} />
                <Route path="/sou" element={<搜索结果 />} />
                <Route path="/c" element={<临时 />} />
                <Route path="/zhongtufa" element={<中图法页面 />} />
                <Route path="/shangchuan" element={<上传文件页面 />} />
                <Route path="/xiugai" element={<修改图书页面 />} />
                <Route path="/" element={
                  <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
                    <p style={{ color: '#666', fontSize: 14, marginTop: 0 }}>
                      按研究生教育学科专业目录的 14 个学科门类与二级专业统计藏书数量；
                      中图法到专业的映射为近似对照，数字含该门类下全部专业。
                    </p>
                    <学科统计表 />
                  </div>
                } />
              </Routes>
            </LayoutWrapper>
          } />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
};

export default App;

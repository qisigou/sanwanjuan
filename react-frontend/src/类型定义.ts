export interface 搜索结果元项 {
  id: number;
  书名: string;
  作者: string;
  出版社: string;
  出版时间:number;
  文件格式:string;
  // 根据你的实际返回数据结构调整
}

export interface 搜索响应 {
  query: string;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  data: 搜索结果元项[];
}
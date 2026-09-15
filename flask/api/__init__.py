from flask import Blueprint

# 创建主API蓝图
api_bp = Blueprint('api', __name__, url_prefix='/api')

# 必须显式导入所有文件，否则只有第一个文件里的能注册路由
from . import 搜索, opds电子书传输, SQL查询与删除, 中图法, 学科统计, 文件入库, 文件上传, 图书信息, AI图书助手

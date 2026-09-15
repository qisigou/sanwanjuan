from flask import Flask
from flask_cors import CORS
import json
import os
import sqlite3


def 修复_书籍入库时间触发器(数据库地址):
    """移除会在修改图书时覆盖入库时间的旧触发器"""
    连接 = None
    try:
        连接 = sqlite3.connect(数据库地址)
        with 连接:
            表存在 = 连接.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='书籍'"
            ).fetchone()
            if not 表存在:
                return
            连接.execute('DROP TRIGGER IF EXISTS set_书籍表_入库时间_trigger')
    except sqlite3.Error as 错误:
        print(f"修复图书入库时间触发器失败: {错误}")
    finally:
        if 连接 is not None:
            连接.close()


def 确保_AI字段(数据库地址):
    """兼容旧数据库，自动补充 AI 评分和评估字段"""
    连接 = None
    try:
        连接 = sqlite3.connect(数据库地址)
        with 连接:
            表存在 = 连接.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='书籍'"
            ).fetchone()
            if not 表存在:
                return
            已有字段 = {
                行[1] for 行 in 连接.execute('PRAGMA table_info(书籍)').fetchall()
            }
            if 'ai评分' not in 已有字段:
                连接.execute('ALTER TABLE 书籍 ADD COLUMN ai评分 TINYINT')
            if 'ai评估状态码' not in 已有字段:
                连接.execute('ALTER TABLE 书籍 ADD COLUMN ai评估状态码 TINYINT')
            if 'ai评估' not in 已有字段:
                连接.execute('ALTER TABLE 书籍 ADD COLUMN ai评估 TEXT')
    except sqlite3.Error as 错误:
        print(f"补充 AI 字段失败: {错误}")
    finally:
        if 连接 is not None:
            连接.close()


def 加载_配置文件(app):
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '配置.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        # 按文件格式加载各类型存储目录（键统一转大写）
        类型存储位置 = config['资源']['图书资源']['类型存储位置']
        app.config['类型存储位置'] = {
            类型.upper(): 路径
            for 类型, 路径 in 类型存储位置.items()
        }
        app.config['封面目录'] = config['资源']['图书资源']['封面存储位置']
        app.config['临时文件夹'] = config['资源']['临时文件夹']
        app.config['数据库文件'] = config['资源'].get('数据库文件', '元数据.db')
        app.config['大语言模型'] = config.get('大语言模型', {})
        app.config['提示词目录'] = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '提示词',
        )
        app.config['MAX_CONTENT_LENGTH'] = int(
            app.config['大语言模型'].get('最大请求字节') or 32 * 1024 * 1024
        )

        # 加载服务器配置（增加默认值）
        app.config['服务器地址'] = config.get('服务器', {}).get('地址', '0.0.0.0')
        app.config['服务器端口'] = config.get('服务器', {}).get('端口', 5000)
        app.config['排障模式'] = config.get('服务器', {}).get('排障', False)

        print(f"配置文件加载成功，类型存储位置: {app.config['类型存储位置']}")
        print(f"临时文件夹: {app.config['临时文件夹']}")
        print(f"服务器配置: 地址={app.config['服务器地址']}, 端口={app.config['服务器端口']}, 排障={app.config['排障模式']}")

    except FileNotFoundError:
        print("配置文件未找到，使用默认值")
        app.config['类型存储位置'] = {'EPUB': "D:/个人图书馆存档epub", 'PDF': "D:/个人图书馆存档pdf"}
        app.config['封面目录'] = "D:/封面图"
        app.config['临时文件夹'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '临时文件')
        app.config['数据库文件'] = '元数据.db'
        app.config['大语言模型'] = {}
        app.config['提示词目录'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '提示词')
        app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
        app.config['服务器地址'] = '0.0.0.0'
        app.config['服务器端口'] = 5000
        app.config['排障模式'] = False
    except Exception as e:
        print(f"配置文件加载失败: {e}")
        app.config['类型存储位置'] = {'EPUB': "D:/个人图书馆存档epub", 'PDF': "D:/个人图书馆存档pdf"}
        app.config['封面目录'] = "D:/封面图"
        app.config['临时文件夹'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '临时文件')
        app.config['数据库文件'] = '元数据.db'
        app.config['大语言模型'] = {}
        app.config['提示词目录'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '提示词')
        app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
        app.config['服务器地址'] = '0.0.0.0'
        app.config['服务器端口'] = 5000
        app.config['排障模式'] = False

def 创建_应用():
    app = Flask(__name__)
    加载_配置文件(app)

    # 允许跨域请求
    CORS(app, resources={r"/*": {"origins": "*"}})

    # 注册 api 蓝图
    from api.搜索 import api_bp
    app.register_blueprint(api_bp)

    根目录 = os.path.dirname(os.path.abspath(__file__))
    app.config['根目录'] = 根目录
    app.config['数据库地址'] = os.path.join(app.config['根目录'], app.config['数据库文件'])
    修复_书籍入库时间触发器(app.config['数据库地址'])
    确保_AI字段(app.config['数据库地址'])
    return app

app = 创建_应用()

if __name__ == "__main__":
    host = app.config['服务器地址']
    port = app.config['服务器端口']
    debug = app.config['排障模式']
    
    app.run(host=host, port=port, debug=debug)

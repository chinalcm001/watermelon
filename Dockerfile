# 使用一个官方的、轻量的 Node.js 运行时作为基础镜像
FROM node:18-alpine

# 在容器内部创建一个目录来存放应用代码
WORKDIR /app

# 拷贝 package.json 和 package-lock.json 文件
# 我们分开拷贝是为了利用 Docker 的层缓存机制
COPY package*.json ./

# 安装生产环境所需的依赖
# 使用 npm ci 而不是 install，可以确保更快速、更可靠的构建
RUN npm ci --only=production

# 将您项目的所有文件拷贝到工作目录中
COPY . .

# 告诉 Docker 容器将监听的端口
EXPOSE 3000

# 定义容器启动时运行的命令
CMD [ "node", "server.js" ]

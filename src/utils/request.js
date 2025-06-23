import axios from "axios";
import { login, setToken, getToken, getTokenType } from "../api/auth";

// 创建 axios 实例
const service = axios.create({
  baseURL: window.baseURL, // 统一接口请求地址
  timeout: 15000, // 请求超时时间
  headers: {
    "Content-Type": "application/json",
  },
});

// 是否正在刷新token
let isRefreshing = false;
// 重试队列
let retryRequests = [];

// 处理401错误的方法
const handle401Error = async (config) => {
  if (!isRefreshing) {
    isRefreshing = true;

    try {
      // 重新登录
      const res = await login();
      if (res.code === 200) {
        const { token, tokenType } = res.data;
        setToken(token, tokenType);

        // 重试队列中的请求
        retryRequests.forEach((cb) => cb(token));
        retryRequests = [];

        // 重试当前请求
        config.headers["Authorization"] = `${tokenType} ${token}`;
        return service(config);
      }
    } catch (err) {
      console.error("重新登录失败:", err);
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  } else {
    // 将请求加入重试队列
    return new Promise((resolve) => {
      retryRequests.push((token) => {
        config.headers["Authorization"] = `${tokenType} ${token}`;
        resolve(service(config));
      });
    });
  }
};

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    const token = getToken();
    const tokenType = getTokenType();
    if (token) {
      config.headers["User-Client"] = `3`;
      config.headers["Authorization"] = `${tokenType} ${token}`;
    }
    return config;
  },
  (error) => {
    console.error("Request error:", error);
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.code && res.code !== 200) {
      if (res.code === 401) {
        return handle401Error(response.config);
      }
      console.error("API error:", res.message);
      return Promise.reject(new Error(res.message || "Error"));
    }
    return res;
  },
  async (error) => {
    const { config } = error;

    if (
      error.response &&
      error.response.status === 401 &&
      error.response.status === 403
    ) {
      return handle401Error(config);
    }

    let message = "请求失败";
    if (error.response) {
      switch (error.response.status) {
        case 403:
          message = "拒绝访问";
          break;
        case 404:
          message = "请求错误，未找到该资源";
          break;
        case 500:
          message = "服务器错误";
          break;
        default:
          message = `连接错误 ${error.response.status}`;
      }
    }
    return Promise.reject(new Error(message));
  }
);

// 封装 GET 请求
export function get(url, params) {
  return service({
    url,
    method: "get",
    params,
  });
}

// 封装 POST 请求
export function post(url, data) {
  return service({
    url,
    method: "post",
    data,
  });
}

// 封装 PUT 请求
export function put(url, data) {
  return service({
    url,
    method: "put",
    data,
  });
}

// 封装 DELETE 请求
export function del(url) {
  return service({
    url,
    method: "delete",
  });
}

export default service;

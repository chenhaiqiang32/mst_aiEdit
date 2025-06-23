import request from "../utils/request";

// 获取登录信息
export function getLoginInfo() {
  return window.loginInfo;
}

// 登录接口
export function login() {
  const loginInfo = getLoginInfo();
  return request({
    url: "/user/login",
    method: "post",
    data: loginInfo,
  });
}

// 存储token
export function setToken(token, tokenType) {
  localStorage.setItem("token", token);
  localStorage.setItem("tokenType", tokenType);
}

// 获取token
export function getToken() {
  return localStorage.getItem("token");
}

// 获取token类型
export function getTokenType() {
  return localStorage.getItem("tokenType");
}

// 清除token
export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("tokenType");
}

export function getCosToken() {
  return request({
    url: "/file/upload/credential",
    method: "get",
  });
}
export function submitFile(data) {
  return request({
    url: "/item/modify",
    method: "post",
    data,
  });
}

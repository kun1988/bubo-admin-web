import type { RequestOptions } from '@@/plugin-request/request';
import { request, type RequestConfig, history } from '@umijs/max';
import { message, notification } from 'antd';
import { refreshToken } from './services/api/auth';

// 错误处理方案： 错误类型
enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}
// 与后端约定的响应数据格式
interface ResponseStructure {
  success: boolean;
  data: any;
  errorCode?: number;
  errorMessage?: string;
  showType?: ErrorShowType;
}

let isRefreshing = false // 控制刷新 token 的状态
let requests: any[] = [] // 存储刷新 token 期间过来的 401 请求
const loginPath = '/auth/login';

let promise: Promise<API.LoginResult>;
function fetchRefreshToken() {
  if (promise) {
    return promise;
  }
  // console.log("-----------------");
  promise = new Promise(async (reslove) => {
    const res = await refreshToken();
    // console.log(res);
    reslove(res);
  })
  return promise;
}

/**
 * @name 错误处理
 * pro 自带的错误处理， 可以在这里做自己的改动
 * @doc https://umijs.org/docs/max/request#配置
 */
export const errorConfig: RequestConfig = {
  // 错误处理： umi@3 的错误处理方案。
  errorConfig: {
    // 错误抛出
    errorThrower: (res) => {
      const { success, data, errorCode, errorMessage, showType } =
        res as unknown as ResponseStructure;
      if (!success) {
        const error: any = new Error(errorMessage);
        error.name = 'BizError';
        error.info = { errorCode, errorMessage, showType, data };
        throw error; // 抛出自制的错误
      }
    },
    // 错误接收及处理
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;
      // console.log('444444444444444')
      // console.log(error)
      // console.log('444444444444444')
      // 我们的 errorThrower 抛出的错误。
      if (error.name === 'BizError') {
        const errorInfo: ResponseStructure | undefined = error.info;
        if (errorInfo) {
          const { errorMessage, errorCode } = errorInfo;
          switch (errorInfo.showType) {
            case ErrorShowType.SILENT:
              // do nothing
              break;
            case ErrorShowType.WARN_MESSAGE:
              message.open({content: errorMessage, type: 'warning'})
              // message.warning(errorMessage);
              break;
            case ErrorShowType.ERROR_MESSAGE:
              message.open({content: errorMessage, type: 'error'})
              // message.error(errorMessage);
              break;
            case ErrorShowType.NOTIFICATION:
              notification.open({
                description: errorMessage,
                message: errorCode,
              });
              break;
            case ErrorShowType.REDIRECT:
              // TODO: redirect
              break;
            default:
              message.open({content: errorMessage, type: 'error'})
              // message.error(errorMessage);
          }
        }
      } else if (error.response) {
        if (error.response.status === 401) {
          // console.log("123123123123")
          // message.error('Unauthorized');
          message.open({content: 'Unauthorized', type: 'error'})
          localStorage.removeItem('token');
          history.push(loginPath);
          return;
        }
        const res = error.response.data as unknown as ResponseStructure;
        if (res?.success === false) {
          const { errorMessage, errorCode } = res;
          if (errorCode !== 30001) {
            switch (res.showType) {
              case ErrorShowType.SILENT:
                // do nothing
                break;
              case ErrorShowType.WARN_MESSAGE:
                message.open({content: errorMessage, type: 'warning'})
                // message.warning(errorMessage);
                break;
              case ErrorShowType.ERROR_MESSAGE:
                message.open({content: errorMessage, type: 'error'})
                // message.error(errorMessage);
                break;
              case ErrorShowType.NOTIFICATION:
                notification.open({
                  description: errorMessage,
                  message: errorCode,
                });
                break;
              case ErrorShowType.REDIRECT:
                // TODO: redirect
                break;
              default:
                message.open({content: errorMessage, type: 'error'})
                // message.error(errorMessage);
            }
          } else {

          }
        } else {
          // Axios 的错误
          // 请求成功发出且服务器也响应了状态码，但状态代码超出了 2xx 的范围
          // message.error(`Response status:${error.response.status}`);
          message.open({content: `Response status:${error.response.status}`, type: 'warning'})
        }
      } else if (error.request) {
        // 请求已经成功发起，但没有收到响应
        // \`error.request\` 在浏览器中是 XMLHttpRequest 的实例，
        // 而在node.js中是 http.ClientRequest 的实例
        message.open({content: 'None response! Please retry.', type: 'error'})
        // message.error('None response! Please retry.');
      } else {
        // 发送请求时出了点问题
        message.open({content: 'Request error, please retry.', type: 'error'})
        // message.error('Request error, please retry.');
      }
    },
  },

  // 请求拦截器
  requestInterceptors: [
    async (config: RequestOptions) => {
      // 拦截请求配置，进行个性化处理。
      const url = config.url?.startsWith('/') ? `${API_URL}` + config.url : config.url;

      const tokenJson = localStorage.getItem('token');
      if (tokenJson) {
        const token = JSON.parse(tokenJson);
        config.headers = {
          ...config.headers,
          Authorization: token.tokenType + " " + (url === `${API_URL}/admin/auth/refresh-token` ? token.refreshToken : token.accessToken),
        };
      }
  
      config.url = url;
      return config;
    },
  ],

  // 响应拦截器
  responseInterceptors: [
    [(response) => {
      // 拦截响应数据，进行个性化处理
      // const { data } = response as unknown as ResponseStructure;
      // if (data?.success === false) {
      //   if (data?.errorCode == 10002) {
      //     // 无 token 直接返回登录页
      //     router.push({ name: 'login' })
      //     return Promise.reject(error)
      //   }
      // }
      return response;
    },
    (error: any) => {
      if (error.response) { // 请求收到响应，但是状态码不是 2xx
        const { status } = error.response;
        // 处理401
        if (status === 401) {
          const { success, data, errorCode, errorMessage, showType } =
          error.response.data as unknown as ResponseStructure;
          // 无token，token无效，token过期
          const tokenJson = localStorage.getItem('token');
          if (!tokenJson) {
            // 无 token 直接返回登录页
            // history.push(loginPath);
            return Promise.reject(error)
          }
          if (errorCode === 30001) {
            if (!isRefreshing) {
              // 尝试获取新的token
              isRefreshing = true // 开启刷新状态
              // console.log('111111111111111111')
              return refreshToken().then(res => {
                // console.log('22222222222222222')
                if (!res.success) {
                  // throw new Error('刷新 Token 失败')
                  // localStorage.removeItem('token');
                  // history.push(loginPath);13
                  return Promise.reject(error)
                }
                // 成功， 将新 token 保存起来
                localStorage.setItem('token', JSON.stringify(res.data))
                // 把 requests 队列中的请求重新发出去
                if (requests && requests.length > 0) {
                  requests.forEach((cb) => cb())
                }
                return request(error.config.url, {...error.config, getResponse: true}) as any
              }).catch(() => {
                // console.log('555555555555555555')
                // 失败，清除当前用户状态, 跳转回登录页
                // localStorage.removeItem('token');
                // history.push(loginPath);
                return Promise.reject(error)
              }).finally(() => {
                requests = [] // 清空原来的请求队列
                isRefreshing = false // 重置刷新状态    
                // console.log('66666666666666666666')
              })   
            }
            // console.log('3333333333333333333333')
            // 刷新状态下，把请求挂起，放到 requests 中
            return new Promise(resolve => {      
              // requests 中维护一个请求队列，调用其中的方法就能将挂起的操作恢复   
              requests.push(() => {    
                resolve(request(error.config))    
              })
            })
            /*
            console.log('111111111111111')
            try {
              const res = await fetchRefreshToken();
              console.log(res)
              if (res) {
                localStorage.setItem('token', JSON.stringify(res.data));
                return request(error.config.url, {...error.config, getResponse: true}) as any;
              }
            } catch (e) {
              console.log(e);  // 输出：Error: 错误
            }
            
            console.log('9999999999999999')
            */
          // } else {
          //   console.log('7777777777777777')
          //   localStorage.removeItem('token');
          //   history.push(loginPath);
          //   return Promise.reject(error)
          } else {
            // localStorage.removeItem('token');
            // history.push(loginPath);
          }
        }
      }
      // console.log('888888888888888888')
      return Promise.reject(error);
    }
  ],
  ],
};

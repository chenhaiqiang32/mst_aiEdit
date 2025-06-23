import COS from "cos-js-sdk-v5";

export function useCos({
  basicPath,
  bucket,
  bucketUrl,
  expiredTime,
  startTime,
  region,
  sessionToken,
  tmpSecretId,
  tmpSecretKey,
}) {
  const cos = new COS({
    async getAuthorization(options, callback) {
      callback({
        TmpSecretId: tmpSecretId,
        TmpSecretKey: tmpSecretKey,
        SecurityToken: sessionToken,
        // 建议返回服务器时间作为签名的开始时间，避免客户端本地时间偏差过大导致签名错误
        StartTime: startTime, // 时间戳，单位秒，如：1580000000
        ExpiredTime: expiredTime, // 时间戳，单位秒，如：1580000000
        ScopeLimit: true, // 细粒度控制权限需要设为 true，会限制密钥只在相同请求时重复使用
      });
    },
  });

  // 上传函数封装
  const uploadFile = (file, key, onProgress) => {
    return new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: `${basicPath}${key}`,
          Body: file,
          onProgress(progressData) {
            const progress = (progressData.loaded / progressData.total) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
        },
        // eslint-disable-next-line func-names
        function (err, data) {
          if (err) {
            reject(err);
          } else {
            resolve({
              ...data,
              Location: `${bucketUrl}${basicPath}${key}`,
            });
          }
        }
      );
    });
  };

  return {
    uploadFile,
  };
}

export default useCos;

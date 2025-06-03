// 人脸识别压力测试脚本
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10, // 虚拟用户数
  duration: '120s', // 测试持续时间
};

const apiKey = "d295e5bf-152c-4cf9-bb91-0088c64cfb12";
const fileBinary = open("./1748919854106.jpg", "b");  // 需将文件放在当前目录

export default function () {
  let formData = {
    file: http.file(fileBinary, "1748919854106.jpg", "image/png"),
  };

  let res = http.post("http://192.168.64.22:8000/api/v1/recognition/recognize", formData, {
    headers: {
      "x-api-key": apiKey,
    },
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
  });
}

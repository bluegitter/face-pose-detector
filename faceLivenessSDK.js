// faceLivenessSDK.js
class FaceLivenessSDK {
  constructor(options) {
    this.videoElement = document.getElementById(options.videoElementId);
    this.statusElement = document.getElementById(options.statusElementId);
    this.timerElement = document.getElementById(options.timerElementId);
    this.canvasElement = document.getElementById(options.canvasElementId);
    this.challengeSequence = options.challengeSequence || ["张嘴", "点头", "眨眼", "向右转头"];
    this.timeout = options.timeout || 30;
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey;
    this.onVerified = options.onVerified || function () {};
    this.onFailed = options.onFailed || function () {};

    this.currentStep = 0;
    this.verified = false;
    this.triggeredVerified = false;
    this.remainingTime = this.timeout;
    this.timerInterval = null;
    this.lastPrintedAction = "";
  }

  start() {
    this._startTimer();
    this._initFaceMesh();
  }

  _startTimer() {
    clearInterval(this.timerInterval);
    this.remainingTime = this.timeout;
    this.timerElement.textContent = `剩余时间：${this.remainingTime}秒`;
    this.timerElement.style.display = 'block';

    this.timerInterval = setInterval(() => {
      this.remainingTime--;
      this.timerElement.textContent = `剩余时间：${this.remainingTime}秒`;
      if (this.remainingTime <= 0) {
        clearInterval(this.timerInterval);
        this.statusElement.textContent = "⛔ 验证失败，请重试！";
        this.currentStep = 0;
        this.verified = false;
        this.triggeredVerified = false;
        this.onFailed();
        this._startTimer();
      }
    }, 1000);
  }

  _drawFaceGuide(ctx) {
    const canvas = this.canvasElement;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
  
    // 👇 缩小横向（从 0.45 → 0.36），增加纵向（从 0.6 → 0.7）
    const faceWidth = canvas.width * 0.40;
    const faceHeight = canvas.height * 0.65;
  
    const topY = centerY - faceHeight / 2;
    const bottomY = centerY + faceHeight / 2;
    const leftX = centerX - faceWidth / 2;
    const rightX = centerX + faceWidth / 2;
  
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
  
    ctx.beginPath();
  
    // 顶部圆额头
    ctx.moveTo(leftX + 25, topY + 20);
    ctx.bezierCurveTo(
      centerX - 50, topY - 35,
      centerX + 50, topY - 35,
      rightX - 25, topY + 20
    );
  
    // 右脸到下巴
    ctx.bezierCurveTo(
      rightX + 30, centerY - 10,
      rightX - 5, bottomY - 25,
      centerX, bottomY
    );
  
    // 下巴到左脸
    ctx.bezierCurveTo(
      leftX + 5, bottomY - 25,
      leftX - 30, centerY - 10,
      leftX + 25, topY + 20
    );
  
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  
    // 提示文字
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    ctx.font = '16px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('请将脸部对准轮廓线区域', canvas.width / 2, canvas.height - 30);
    ctx.restore();
  }
  
  
  

  _initFaceMesh() {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(async (results) => {
      const canvasCtx = this.canvasElement.getContext('2d');
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      canvasCtx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
      this._drawFaceGuide(canvasCtx);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        for (const landmarks of results.multiFaceLandmarks) {
          drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: 'rgba(192,192,192,0.3)', lineWidth: 0.5 });
          drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: 'rgba(255,48,48,0.4)', lineWidth: 0.5 });
          drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: 'rgba(48,255,48,0.4)', lineWidth: 0.5 });
          drawConnectors(canvasCtx, landmarks, FACEMESH_FACE_OVAL, { color: 'rgba(224,224,224,0.3)', lineWidth: 0.5 });
          drawLandmarks(canvasCtx, landmarks, { color: 'rgba(255,111,0,0.3)', radius: 0.5 });

          const pose = this._estimatePose(landmarks);
          const mouthOpen = this._detectMouthOpen(landmarks);
          const bothEyesClosed = this._detectEyeClosed(landmarks, true) && this._detectEyeClosed(landmarks, false);

          const additionalStatus = `${mouthOpen ? '👄张嘴' : ''}${bothEyesClosed ? ' 👁️眨眼' : ''}`;
          const fullActionText = `${pose.action} ${additionalStatus}`;

          if (fullActionText !== this.lastPrintedAction) {
            // console.log(fullActionText);
            this.lastPrintedAction = fullActionText;
          }

          const passed = this._checkPoseSequence(pose, mouthOpen, bothEyesClosed);

          if (passed && !this.triggeredVerified) {
            this.triggeredVerified = true;
            this.statusElement.textContent = `✅ 验证通过 🎉`;
            this.timerElement.style.display = 'none';
            await this._performFaceRecognition();
          } else if (!passed) {
            this.statusElement.textContent = `请 ${this.challengeSequence[this.currentStep]}｜当前：${pose.action} ${additionalStatus}`;
          }
        }
      } else {
        this.statusElement.textContent = '未检测到人脸';
      }

      canvasCtx.restore();
    });

    const camera = new Camera(this.videoElement, {
      onFrame: async () => await faceMesh.send({ image: this.videoElement }),
      width: 640,
      height: 480
    });
    camera.start();
  }

  async _performFaceRecognition() {
    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('file', blob, 'frame.png');

      try {
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: { "x-api-key": this.apiKey },
          body: formData
        });

        const data = await response.json();
        console.log("人脸识别结果:", data);

        const subjects = data?.result?.[0]?.subjects || [];
        if (subjects.length > 0 && subjects[0].similarity >= 0.95) {
          const subjectName = subjects[0].subject;
          this.onVerified(subjectName);
        } else {
          this.statusElement.textContent = `❌ 身份不匹配！`;
          this.onFailed();
        }
      } catch (err) {
        console.error("人脸识别请求失败", err);
        this.statusElement.textContent = `❌ 网络错误！`;
        this.onFailed();
      }
    }, 'image/png');
  }

  _detectMouthOpen(landmarks) {
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const faceHeight = Math.abs(landmarks[10].y - landmarks[152].y);
    const mouthDist = Math.abs(upperLip.y - lowerLip.y);
    const ratio = mouthDist / faceHeight;
    return ratio > 0.08;
  }

  _detectEyeClosed(landmarks, left = true) {
    const p1 = left ? landmarks[159] : landmarks[386];
    const p2 = left ? landmarks[145] : landmarks[374];
    const p3 = left ? landmarks[33] : landmarks[263];
    const p4 = left ? landmarks[133] : landmarks[362];
    const vertical = Math.abs(p1.y - p2.y);
    const horizontal = Math.abs(p3.x - p4.x);
    const ear = vertical / horizontal;
    return ear < 0.1;
  }

  _estimatePose(landmarks) {
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const noseTip = landmarks[1];
    const chin = landmarks[152];
    const yawRad = Math.atan2(rightEye.z - leftEye.z, rightEye.x - leftEye.x);
    const yaw = yawRad * (180 / Math.PI);
    const dz = chin.z - noseTip.z;
    const dy = chin.y - noseTip.y;
    const pitchRad = Math.atan2(dz, dy);
    const pitch = pitchRad * (180 / Math.PI);
    const rollRad = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    const roll = rollRad * (180 / Math.PI);

    let action = "保持静止";
    if (yaw > 20) action = "向左转头";
    else if (yaw < -20) action = "向右转头";
    else if (pitch > 25) action = "低头";
    else if (pitch < 10) action = "抬头";
    else if (roll > 20) action = "向左倾斜";
    else if (roll < -20) action = "向右倾斜";

    return { yaw, pitch, roll, action };
  }

  _checkPoseSequence(pose, mouthOpen, eyeClosed) {
    if (this.verified) return true;
    const currentChallenge = this.challengeSequence[this.currentStep];
    let matched = false;

    switch (currentChallenge) {
      case "张嘴": matched = mouthOpen; break;
      case "眨眼": matched = eyeClosed; break;
      case "点头": matched = pose.pitch > 25; break;
      case "抬头": matched = pose.pitch < 10; break;
      case "向左转头": matched = pose.yaw > 20; break;
      case "向右转头": matched = pose.yaw < -20; break;
      case "向右倾斜": matched = pose.roll < -20; break;
      case "向左倾斜": matched = pose.roll > 20; break;
    }

    if (matched) {
      console.log(`✅ 已完成：${currentChallenge}`);
      this.currentStep++;
    }

    if (this.currentStep >= this.challengeSequence.length) {
      this.verified = true;
      clearInterval(this.timerInterval);
      return true;
    }

    return false;
  }
}

window.FaceLivenessSDK = FaceLivenessSDK;

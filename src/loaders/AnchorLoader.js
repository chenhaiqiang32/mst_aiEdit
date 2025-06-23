import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

export class AnchorLoader {
  constructor(editor) {
    this.editor = editor;
    this.textureLoader = new THREE.TextureLoader();

    // 主边框线材质（淡蓝色）
    this.lineMaterial = new LineMaterial({
      color: 0x90caf9, // Material UI 蓝
      linewidth: 2,
      transparent: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });

    // 阴影/光晕线材质（更粗、更透明）
    this.glowLineMaterial = new LineMaterial({
      color: 0x90caf9,
      linewidth: 8,
      transparent: true,
      opacity: 0.2,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });

    // 初始化 GLTFLoader
    this.gltfLoader = new GLTFLoader();

    // 添加 DRACOLoader 支持
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
    );
    this.gltfLoader.setDRACOLoader(dracoLoader);

    // 支持多个视频标记物
    if (!this.editor.videoAnchors) {
      this.editor.videoAnchors = [];
    }
  }

  createBorderLine(object) {
    // 移除旧的边框线
    this.cleanupBorderLines();

    // 移除旧的缩放控制点
    this.cleanupScaleHandles();

    // 计算对象的边界框
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // 创建边框顶点
    const points = [];
    const halfWidth = size.x / 2;
    const halfHeight = size.y / 2;
    points.push(
      new THREE.Vector3(center.x - halfWidth, center.y - halfHeight, 0.1),
      new THREE.Vector3(center.x + halfWidth, center.y - halfHeight, 0.1),
      new THREE.Vector3(center.x + halfWidth, center.y + halfHeight, 0.1),
      new THREE.Vector3(center.x - halfWidth, center.y + halfHeight, 0.1),
      new THREE.Vector3(center.x - halfWidth, center.y - halfHeight, 0.1)
    );
    const positions = points.flatMap((p) => [p.x, p.y, p.z]);
    const geometry = new LineGeometry().setPositions(positions);

    // 阴影/光晕线
    const glowLine = new Line2(geometry, this.glowLineMaterial);
    glowLine.computeLineDistances();
    this.editor.glowBorderLine = glowLine;
    this.editor.scene.add(glowLine);

    // 主边框线
    const line = new Line2(geometry, this.lineMaterial);
    line.computeLineDistances();
    this.editor.borderLine = line;
    this.editor.scene.add(line);

    // 创建四个边角的缩放控制点
    this.createScaleHandles(center, halfWidth, halfHeight);
  }

  createScaleHandles(center, halfWidth, halfHeight) {
    const handleSize = 24; // 控制点大小
    const handleGeometry = new THREE.PlaneGeometry(handleSize, handleSize);
    const handleMaterial = new THREE.MeshBasicMaterial({
      color: 0x90caf9,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    // 四个边角的位置（相对于标记物中心）
    const corners = [
      { x: -halfWidth, y: halfHeight, name: "topLeft" }, // 左上角
      { x: halfWidth, y: halfHeight, name: "topRight" }, // 右上角
      { x: halfWidth, y: -halfHeight, name: "bottomRight" }, // 右下角
      { x: -halfWidth, y: -halfHeight, name: "bottomLeft" }, // 左下角
    ];

    this.editor.scaleHandles = [];

    corners.forEach((corner, index) => {
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      // 控制点位置 = 标记物中心 + 边角偏移
      handle.position.set(center.x + corner.x, center.y + corner.y, 0.2);
      handle.userData = {
        type: "scaleHandle",
        cornerIndex: index,
        cornerName: corner.name,
        originalPosition: {
          x: center.x + corner.x,
          y: center.y + corner.y,
        },
      };
      handle.renderOrder = 10;
      this.editor.scene.add(handle);
      this.editor.scaleHandles.push(handle);
    });
  }

  // 新增：清理边框线
  cleanupBorderLines() {
    if (this.editor.borderLine) {
      if (this.editor.borderLine.geometry) {
        this.editor.borderLine.geometry.dispose();
      }
      this.editor.scene.remove(this.editor.borderLine);
      this.editor.borderLine = null;
    }

    if (this.editor.glowBorderLine) {
      if (this.editor.glowBorderLine.geometry) {
        this.editor.glowBorderLine.geometry.dispose();
      }
      this.editor.scene.remove(this.editor.glowBorderLine);
      this.editor.glowBorderLine = null;
    }
  }

  // 新增：清理缩放控制点
  cleanupScaleHandles() {
    if (this.editor.scaleHandles) {
      this.editor.scaleHandles.forEach((handle) => {
        if (handle.geometry) {
          handle.geometry.dispose();
        }
        if (handle.material) {
          handle.material.dispose();
        }
        this.editor.scene.remove(handle);
      });
      this.editor.scaleHandles = [];
    }
  }

  // 辅助函数：判断是否为视频格式
  isVideo(url) {
    return /\.(mp4|webm|ogg)$/i.test(url);
  }

  loadAnchor(url, position = null) {
    console.log("Loading anchor from URL:", url);

    // 检查文件类型
    const isModel =
      url.toLowerCase().endsWith(".glb") || url.toLowerCase().endsWith(".gltf");
    const isVideoFile = this.isVideo(url);
    console.log(
      "File type detection:",
      isModel ? "3D Model" : isVideoFile ? "Video" : "Texture"
    );

    if (isModel) {
      return this.loadModel(url, position);
    } else if (isVideoFile) {
      return this.loadVideoTexture(url, position);
    } else {
      return this.loadTexture(url, position);
    }
  }

  loadTexture(url, position = null) {
    return new Promise((resolve, reject) => {
      if (!this.editor.texture) {
        reject(new Error("请先加载纹理图片"));
        return;
      }
      this.textureLoader.load(
        url,
        (texture) => {
          console.log("Anchor texture loaded successfully:", texture);

          // 获取图片原始尺寸（像素）
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
          const width = texture.image.width;
          const height = texture.image.height;
          console.log("Anchor dimensions:", width, "x", height);

          // 创建几何体时直接使用像素尺寸
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
          });
          const mesh = new THREE.Mesh(geometry, material);

          // 设置标记物位置到纹理底图中心
          if (position) {
            mesh.position.set(position.x, position.y, position.z || 0.1);
          } else {
            mesh.position.set(
              this.editor.texture.position.x,
              this.editor.texture.position.y,
              0.1
            );
          }

          mesh.renderOrder = 1; // 保证标记物图片在底图之上

          this.editor.scene.add(mesh);

          // 添加到标记物数组
          this.editor.anchors.push(mesh);

          // 创建边框线
          this.createBorderLine(mesh);

          // 保存原始尺寸
          this.editor.originalAnchorSize.set(width, height);
          this.editor.currentSize.set(width, height);

          // 更新坐标显示
          this.editor.infoController.updateInfo();

          resolve(mesh);
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        (error) => {
          console.error("Error loading anchor texture:", error);
          reject(new Error("标记物加载失败，请检查图片URL是否正确"));
        }
      );
    });
  }

  loadModel(url, position = null) {
    return new Promise((resolve, reject) => {
      if (!this.editor.texture) {
        reject(new Error("请先加载纹理图片"));
        return;
      }
      console.log("Starting to load 3D model from:", url);

      this.gltfLoader.load(
        url,
        (gltf) => {
          try {
            console.log("Model loaded successfully:", gltf);

            const model = gltf.scene;
            console.log("Model:", model);

            // 设置模型材质透明属性，防止遮挡底图透明区域
            model.traverse((child) => {
              if (child.isMesh && child.material) {
                child.material.transparent = true;
                child.material.alphaTest = 0.4;
                child.material.depthTest = true;
                child.material.depthWrite = true;
                // 可选：如有需要可设置 child.material.side = THREE.DoubleSide;
              }
            });

            // 计算模型的边界框
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            console.log("Model size:", size);
            console.log("Model bounding box center:", center);

            // 获取纹理的边界
            const textureBox = new THREE.Box3().setFromObject(
              this.editor.texture
            );
            const texSize = new THREE.Vector3();
            textureBox.getSize(texSize);

            // 居中模型
            model.position.sub(center);

            // 缩放模型到纹理宽高的1/3
            let scale = 1;
            if (size.x > 0 && size.y > 0) {
              scale = Math.min(texSize.x / size.x, texSize.y / size.y) * 0.33;
              model.scale.setScalar(scale);
            }

            // 重置模型旋转
            model.rotation.set(0, 0, 0);

            // 创建一个组来包装模型，便于统一控制
            const modelGroup = new THREE.Group();
            modelGroup.add(model);

            // 检查模型是否有动画
            if (gltf.animations && gltf.animations.length > 0) {
              console.log("Model has animations:", gltf.animations.length);

              // 创建动画混合器
              const mixer = new THREE.AnimationMixer(model);

              // 播放第一个动画
              const firstAnimation = gltf.animations[0];
              console.log("Playing first animation:", firstAnimation.name);
              const action = mixer.clipAction(firstAnimation);
              action.play();

              // 将动画混合器存储到模型组中，以便后续更新
              modelGroup.userData.animationMixer = mixer;
              modelGroup.userData.animationAction = action;

              // 将动画混合器添加到编辑器的动画更新循环中
              if (!this.editor.animationMixers) {
                this.editor.animationMixers = [];
              }
              this.editor.animationMixers.push(mixer);
            }

            // 设置模型组的位置到纹理底图中心
            if (position) {
              modelGroup.position.set(position.x, position.y, position.z || 20);
            } else {
              modelGroup.position.set(
                this.editor.texture.position.x,
                this.editor.texture.position.y,
                20
              );
            }

            modelGroup.renderOrder = 5; // 保证模型在底图之上即可

            // 添加环境光和平行光
            const ambientLight = new THREE.AmbientLight(0xffffff, 1);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(0, 4, 1);
            modelGroup.add(ambientLight);
            modelGroup.add(directionalLight);

            // 存储原始尺寸和变换信息
            modelGroup.userData = {
              originalSize: size.clone(),
              isModel: true,
              originalScale: new THREE.Vector3(scale, scale, scale),
              originalPosition: modelGroup.position.clone(),
              originalRotation: modelGroup.rotation.clone(),
              modelUrl: url, // 保存模型URL
              modelCenterOffset: center.clone(), // 保存模型中心偏移量
              ...modelGroup.userData, // 保留之前设置的动画相关数据
            };
            this.editor.scene.add(modelGroup);

            // 添加到标记物数组
            this.editor.anchors.push(modelGroup);

            // 创建边框线
            this.createBorderLine(modelGroup);

            // 保存原始尺寸
            this.editor.originalAnchorSize.set(size.x, size.y);
            this.editor.currentSize.set(size.x, size.y);

            // 更新坐标显示
            this.editor.infoController.updateInfo();

            resolve(modelGroup);
          } catch (error) {
            console.error("Error processing loaded model:", error);
            reject(new Error("模型处理失败：" + error.message));
          }
        },
        (xhr) => {
          console.log(
            "Loading progress:",
            (xhr.loaded / xhr.total) * 100 + "%"
          );
        },
        (error) => {
          console.error("Error loading model:", error);
          reject(
            new Error(
              "模型加载失败：" + (error.message || "请检查文件格式是否正确")
            )
          );
        }
      );
    });
  }

  loadVideoTexture(url, position = null) {
    return new Promise((resolve, reject) => {
      // 允许没有底图时也能添加视频标记物
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.style.display = "none";
      document.body.appendChild(video);

      // 事件回调
      const onCanPlay = () => {
        video.removeEventListener("canplay", onCanPlay);

        video.play();

        const width = video.videoWidth;
        const height = video.videoHeight;

        const texture = new THREE.VideoTexture(video);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.colorSpace = THREE.SRGBColorSpace;

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1,
          depthTest: true,
          depthWrite: false,
          alphaTest: 0.8,
        });
        const mesh = new THREE.Mesh(geometry, material);

        // 支持多个视频标记物，默认放在底图中心，否则场景中心
        let posX = 0,
          posY = 0;
        if (position) {
          posX = position.x;
          posY = position.y;
        } else if (this.editor.texture) {
          posX = this.editor.texture.position.x;
          posY = this.editor.texture.position.y;
        }
        mesh.position.set(
          posX,
          posY,
          0.1 + this.editor.videoAnchors.length * 0.1
        );
        mesh.renderOrder = 10 + this.editor.videoAnchors.length;

        this.editor.scene.add(mesh);

        // 添加到标记物数组
        this.editor.anchors.push(mesh);

        // 创建边框线
        this.createBorderLine(mesh);

        // 保存到 videoAnchors
        this.editor.videoAnchors.push({ mesh, video, url });

        // 更新坐标显示
        if (
          this.editor.infoController &&
          this.editor.infoController.updateInfo
        ) {
          this.editor.infoController.updateInfo();
        }

        resolve(mesh);
      };

      video.addEventListener("canplay", onCanPlay);

      video.addEventListener("error", (e) => {
        video.removeEventListener("canplay", onCanPlay);
        reject(new Error("视频加载失败，请检查视频URL是否正确"));
      });

      video.load();
    });
  }
}

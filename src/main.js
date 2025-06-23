import "./style.css";
import * as THREE from "three";
import { getCosToken, submitFile } from "./api/auth";
import { useCos } from "./components/useCos";
import { v4 as uuid } from "uuid";
import { throttle } from "./utils/throttle";
import { TextureLoader } from "./loaders/TextureLoader";
import { AnchorLoader } from "./loaders/AnchorLoader";
import { CameraController } from "./controllers/CameraController";
import { RendererController } from "./controllers/RendererController";
import { InfoController } from "./controllers/InfoController";
import { EventController } from "./controllers/EventController";

class Editor {
  constructor(container) {
    this.container = container;
    this.containerSize = new THREE.Vector2(
      container.clientWidth,
      container.clientHeight
    );
    this.viewportSize = new THREE.Vector2(
      container.clientWidth,
      container.clientHeight
    );

    this.cosData = {
      // cos上传凭证数据
      basicPath: "test/freeInspection/",
      bucket: "v3-1258209752",
      bucketUrl: "https://v3-file.url.mo.cn/",
      expiredTime: 1749467236,
      ossType: "cos",
      region: "ap-shanghai",
      sessionToken:
        "i6PFmIe9gndd7lhvWPC4MH2c72SYUw4a53edac21206647fc047146f53e9a3b81YyJEG1j3kOkv93iA36DTLvvsprFyekhT5yLhykqsBtdX4mxUkfUyH9bcZ0gLdfaTT1uLQJzC-gYx7uVlZ4_OOAUGkbqejK0lExSKvaUi8mozzBc6fkTPe6VVI6_MiMATE18uGZ2T9CGtoBohxVoxC5Eik3eoe4vVJBEcExJzgHnrY-sz_YWyBZWzqI5c5wAs96hymsAg8c71AKClcTVXVO_en-fuKFRQ2huzShs5G9zW8jia8CTjD_jwXV4XpNSYptKlqdstw0MAexTwFN9p37XUy4P3fDNdcWezzHgITG6jCDwrYTLJvFwASCt9Xm82G_J4OdHkJ52yVDpLZl_74fnkoB0z0nrZLQAHwrHyvDf6LgnWz1Nu7DlgF_02JnSLG_zS9K0ftBw6ZyVruymKREJpiDD2NrFExrz2dc488TsaWl7DHzm-oBxnOLMXPxeJj2lsYFYmyoQvVBR0WtJJi0qAjoGPbLn8wjnPmIiYQhMnkxzeA9SmJM0tll2wgyK5AmXGwFeTOJCCEtOVF1TQZpe4tM5KBJBu3J5vCotuXomSZ6YNZIpyBg1xty29YwUy",
      startTime: 1749466336,
      tmpSecretId:
        "AKIDPMDdtYaT8gOmtwRlZrY34XgEmZ5eZCJoEQn-2iiH9tw9PYsKxLMY6GFEJ5S_eKny",
      tmpSecretKey: "sTlTwoV97/ktgkKDMUpJkdrCEwnAdw8kyN71217/aB4=",
    };

    // 初始化场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0.46, 0.46, 0.46); // three.js编辑器风格中灰色

    // 创建网格底面
    this.createGridPlane();

    // 初始化相机
    this.camera = new THREE.OrthographicCamera( // 正交相机
      -container.clientWidth / 2,
      container.clientWidth / 2,
      container.clientHeight / 2,
      -container.clientHeight / 2,
      0.1,
      10000
    );
    this.camera.position.z = 1000;
    this.camera.zoom = 1;

    // 初始化渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // 关闭抗锯齿，像素风格更清晰
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(dpr); // 设置为设备像素比
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.domElement.style.width = container.clientWidth + "px";
    this.renderer.domElement.style.height = container.clientHeight + "px";
    container.appendChild(this.renderer.domElement);

    // 初始化状态变量
    this.texture = null;
    this.textures = []; // 存储所有上传的纹理
    this.anchors = []; // 存储多个标记物
    this.selectedAnchor = null; // 当前选中的标记物
    this.isDragging = false;
    this.isScaling = false;
    this.dragStart = new THREE.Vector2();
    this.scaleStart = new THREE.Vector2();
    this.currentPosition = new THREE.Vector2();
    this.currentSize = new THREE.Vector2(1, 1);
    this.originalAnchorSize = new THREE.Vector2(1, 1);
    this.originalScale = 1;
    this.originalPosition = new THREE.Vector3();
    this.textureBox = null;

    // 获取UI元素
    this.textureList = document.getElementById("textureList");
    this.anchorList = document.getElementById("anchorList");
    this.extraInfo = document.getElementById("extraInfo");

    // 初始化时钟用于动画
    this.clock = new THREE.Clock();

    // 初始化控制器
    this.cameraController = new CameraController(this);
    this.rendererController = new RendererController(this);
    this.infoController = new InfoController(this);
    this.eventController = new EventController(this);

    // 初始化加载器
    this.textureLoader = new TextureLoader(this);
    this.anchorLoader = new AnchorLoader(this);

    // 初始化节流函数
    this.updateInfoThrottled = throttle(
      this.infoController.updateInfo.bind(this.infoController),
      16
    );

    // 添加坐标轴
    const axesHelper = new THREE.AxesHelper(1000);
    axesHelper.position.set(0, 0, 0);
    this.scene.add(axesHelper);
    this.axesHelper = axesHelper;
    this.fetchCosToken();
    // 开始动画循环
    this.animate();
  }

  async handleFileUpload(file, type = "texture", position = null) {
    const loading = document.getElementById("loading");
    loading.classList.remove("hidden");

    try {
      if (!this.cosData.tmpSecretId) {
        await this.fetchCosToken();
      }
      const { uploadFile } = useCos(this.cosData);
      const fileExtension = file.name.split(".").pop();
      const fileKey = `models/${uuid()}.${fileExtension}`;
      const result = await uploadFile(file, fileKey, (progress) => {});
      console.log("Upload result:", result);

      const fileUrl = result.Location || result.url;
      console.log("File URL:", fileUrl);

      if (type === "texture") {
        this.texture = await this.textureLoader.loadTexture(fileUrl);
        this.addTextureToList(this.texture, file.name);
        // 隐藏拖拽区域
        const dropZone = document.getElementById("dropZone");
        if (dropZone) {
          dropZone.style.display = "none";
        }
      } else {
        const anchor = await this.anchorLoader.loadAnchor(fileUrl, position);
        this.addAnchorToList(anchor, file.name);
        this.selectedAnchor = anchor;
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert(error.message || "文件上传失败");
    } finally {
      loading.classList.add("hidden");
    }
  }

  async fetchCosToken() {
    try {
      const res = await getCosToken();
      this.cosData = res.data;
      console.log("COS Token 获取成功:", this.cosData);
    } catch (e) {
      console.error("获取 COS Token 失败:", e);
    }
  }

  async save() {
    if (!this.texture || this.anchors.length === 0) {
      alert("请先上传纹理底图和标记物");
      return;
    }

    const data = {
      texture: {
        url: this.texture.material.map.source.data.src,
        size: {
          width: this.texture.material.map.image.width,
          height: this.texture.material.map.image.height,
        },
      },
      anchor: this.anchors.map((anchor) => ({
        type: (() => {
          if (anchor.userData?.isModel) {
            return "MODEL";
          } else if (anchor.material?.map?.source?.data?.tagName === "VIDEO") {
            return "VIDEO";
          } else if (anchor.material?.map) {
            return "PIC";
          } else {
            return "MODEL"; // 默认类型
          }
        })(),
        position: {
          x: Math.round(anchor.position.x * 100),
          y: Math.round(anchor.position.y * 100),
        },
        size: {
          width: Math.round(anchor.scale.x * 100),
          height: Math.round(anchor.scale.y * 100),
        },
        url:
          anchor.material?.map?.source?.data?.src || anchor.userData?.modelUrl,
      })),
      extra: this.extraInfo.value,
    };

    try {
      alert(JSON.stringify(data));
      const response = await submitFile(data);
      console.log("保存成功:", response);
      alert("保存成功");
    } catch (error) {
      console.error("保存失败:", error);
      alert(error.message || "保存失败");
    }
  }

  clearCanvas() {
    // 清空纹理
    if (this.texture) {
      if (this.texture.material) {
        if (this.texture.material.map) {
          this.texture.material.map.dispose();
        }
        this.texture.material.dispose();
      }
      if (this.texture.geometry) {
        this.texture.geometry.dispose();
      }
      this.scene.remove(this.texture);
      this.texture = null;
      // 显示拖拽区域
      const dropZone = document.getElementById("dropZone");
      if (dropZone) {
        dropZone.style.display = "block";
      }
    }

    // 清理所有标记物
    this.anchors.forEach((anchor) => {
      // 清理动画混合器
      if (anchor.userData && anchor.userData.animationMixer) {
        const mixerIndex = this.animationMixers.indexOf(
          anchor.userData.animationMixer
        );
        if (mixerIndex > -1) {
          this.animationMixers.splice(mixerIndex, 1);
        }
      }

      // 使用新的清理方法
      this.cleanupAnchor(anchor);
      this.scene.remove(anchor);
    });

    // 清空标记物数组
    this.anchors = [];
    this.selectedAnchor = null;

    // 使用新的清理方法
    this.cleanupBorderLines();
    this.cleanupScaleHandles();

    // 清空UI列表
    if (this.textureList) this.textureList.innerHTML = "";
    if (this.anchorList) this.anchorList.innerHTML = "";
    if (this.extraInfo) this.extraInfo.value = "";

    // 清空轮廓效果
    if (this.rendererController.outlinePass) {
      this.rendererController.outlinePass.selectedObjects = [];
    }

    // 清空信息显示
    const coordinates = document.getElementById("coordinates");
    const dimensions = document.getElementById("dimensions");
    if (coordinates) coordinates.textContent = "";
    if (dimensions) dimensions.textContent = "";

    // 清空纹理边界框缓存
    this.textureBox = null;

    // 清空刻度和重置相机（调用 TextureLoader 的 cleanup）
    if (
      this.textureLoader &&
      typeof this.textureLoader.cleanup === "function"
    ) {
      this.textureLoader.cleanup();
    }

    // 重置状态
    this.isDragging = false;
    this.isScaling = false;
    this.dragStart = new THREE.Vector2();
    this.scaleStart = new THREE.Vector2();
    this.currentPosition = new THREE.Vector2();
    this.currentSize = new THREE.Vector2(1, 1);
    this.originalAnchorSize = new THREE.Vector2(1, 1);
    this.originalScale = 1;
    this.originalPosition = new THREE.Vector3();

    // 重新渲染场景
    this.renderer.render(this.scene, this.camera);
  }

  deleteAnchor() {
    if (this.selectedAnchor) {
      const index = this.anchors.indexOf(this.selectedAnchor);
      if (index > -1) {
        // 从UI列表中移除
        const anchorItem = this.anchorList.querySelector(
          `[data-anchor-id="${this.selectedAnchor.uuid}"]`
        );
        if (anchorItem) {
          this.anchorList.removeChild(anchorItem);
        }

        // 清理动画混合器
        if (
          this.selectedAnchor.userData &&
          this.selectedAnchor.userData.animationMixer
        ) {
          const mixerIndex = this.animationMixers.indexOf(
            this.selectedAnchor.userData.animationMixer
          );
          if (mixerIndex > -1) {
            this.animationMixers.splice(mixerIndex, 1);
          }
        }

        // 清理标记物的材质和几何体
        this.cleanupAnchor(this.selectedAnchor);

        this.scene.remove(this.selectedAnchor);
        this.anchors.splice(index, 1);
        this.selectedAnchor = null;

        // 清理边框线和光晕线
        this.cleanupBorderLines();

        // 清理缩放控制点
        this.cleanupScaleHandles();

        // 清空轮廓效果
        if (this.rendererController.outlinePass) {
          this.rendererController.outlinePass.selectedObjects = [];
        }

        // 清空信息显示
        const coordinates = document.getElementById("coordinates");
        const dimensions = document.getElementById("dimensions");
        if (coordinates) coordinates.textContent = "";
        if (dimensions) dimensions.textContent = "";

        // 重置状态
        this.isDragging = false;
        this.isScaling = false;
        this.dragStart = new THREE.Vector2();
        this.scaleStart = new THREE.Vector2();
        this.currentPosition = new THREE.Vector2();
        this.currentSize = new THREE.Vector2(1, 1);
        this.originalAnchorSize = new THREE.Vector2(1, 1);
        this.originalScale = 1;
        this.originalPosition = new THREE.Vector3();

        // 重新渲染场景
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  // 新增：递归清理标记物及其子对象
  cleanupAnchor(anchor) {
    if (!anchor) return;

    // 如果是Group，递归清理所有子对象
    if (anchor.isGroup) {
      const children = [...anchor.children];
      children.forEach((child) => {
        this.cleanupAnchor(child);
        anchor.remove(child);
      });
    }

    // 清理材质和几何体
    if (anchor.material) {
      if (Array.isArray(anchor.material)) {
        anchor.material.forEach((mat) => {
          if (mat.map) {
            mat.map.dispose();
          }
          mat.dispose();
        });
      } else {
        if (anchor.material.map) {
          anchor.material.map.dispose();
        }
        anchor.material.dispose();
      }
    }

    if (anchor.geometry) {
      anchor.geometry.dispose();
    }

    // 清理用户数据
    if (anchor.userData) {
      anchor.userData = {};
    }
  }

  // 新增：清理边框线
  cleanupBorderLines() {
    if (this.borderLine) {
      if (this.borderLine.geometry) {
        this.borderLine.geometry.dispose();
      }
      if (this.borderLine.material) {
        this.borderLine.material.dispose();
      }
      this.scene.remove(this.borderLine);
      this.borderLine = null;
    }

    if (this.glowBorderLine) {
      if (this.glowBorderLine.geometry) {
        this.glowBorderLine.geometry.dispose();
      }
      if (this.glowBorderLine.material) {
        this.glowBorderLine.material.dispose();
      }
      this.scene.remove(this.glowBorderLine);
      this.glowBorderLine = null;
    }
  }

  // 新增：清理缩放控制点
  cleanupScaleHandles() {
    if (this.scaleHandles) {
      this.scaleHandles.forEach((handle) => {
        if (handle.geometry) {
          handle.geometry.dispose();
        }
        if (handle.material) {
          handle.material.dispose();
        }
        this.scene.remove(handle);
      });
      this.scaleHandles = [];
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // 更新动画混合器
    if (this.animationMixers && this.animationMixers.length > 0) {
      const deltaTime = this.clock ? this.clock.getDelta() : 0.016; // 默认60fps
      this.animationMixers.forEach((mixer) => {
        mixer.update(deltaTime);
      });
    }

    this.rendererController.render();
    // 更新刻度值位置
    if (this.updatePixelMarkers) {
      this.updatePixelMarkers();
    }
  }

  createGridPlane() {
    // 创建一个基础网格
    const size = 20000000;
    const divisions = 500000;
    const gridHelper = new THREE.GridHelper(
      size,
      divisions,
      0x444444,
      0x888888
    );
    gridHelper.position.y = 0;
    gridHelper.material.depthTest = false;
    gridHelper.material.depthWrite = false;
    gridHelper.rotation.x = Math.PI / 2; // 使网格朝向屏幕
    gridHelper.renderOrder = -10;
    this.scene.add(gridHelper);
    this.gridPlane = gridHelper;
  }

  updateGridSize() {
    if (this.gridPlane) {
      const container = document.getElementById("editor");
      const width = container.clientWidth;
      const height = container.clientHeight;
      const maxDimension = Math.max(width, height);

      // 更新网格大小
      this.gridPlane.scale.set(maxDimension / 1000, maxDimension / 1000, 1);
    }
  }

  // 修改 updateRendererSize 方法
  updateRendererSize() {
    const container = document.getElementById("editor");
    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    // 更新渲染器尺寸和像素比
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = width + "px";
    this.renderer.domElement.style.height = height + "px";

    // 更新composer尺寸
    if (this.composer) {
      this.composer.setSize(width, height);
    }

    // 更新容器尺寸
    this.containerSize.set(width, height);

    // 如果已经有纹理，重新调整相机
    if (this.texture && this.viewportSize) {
      this.cameraController.adjustCameraToTexture(
        this.texture.geometry.parameters.width,
        this.texture.geometry.parameters.height
      );
      // 更新缓存的纹理边界框
      this.textureBox = new THREE.Box3().setFromObject(this.texture);
    }

    // 更新线条材质的分辨率
    if (this.anchorLoader && this.anchorLoader.lineMaterial) {
      this.anchorLoader.lineMaterial.resolution.set(width, height);
    }

    // 更新网格大小
    this.updateGridSize();
  }

  addTextureToList(texture, name) {
    if (!this.textureList) return;
    // 只保留最新一张
    this.textureList.innerHTML = "";

    const textureItem = document.createElement("div");
    textureItem.className = "list-item";
    textureItem.dataset.textureUrl = texture.material.map.source.data.src;

    const img = document.createElement("img");
    img.src = texture.material.map.source.data.src;
    textureItem.appendChild(img);

    const span = document.createElement("span");
    span.textContent = name;
    textureItem.appendChild(span);

    this.textureList.appendChild(textureItem);
  }

  addAnchorToList(anchor, name) {
    if (!this.anchorList) return;
    const anchorItem = document.createElement("div");
    anchorItem.className = "list-item";
    anchorItem.dataset.anchorId = anchor.uuid; // 使用uuid作为唯一标识

    const img = document.createElement("img");
    // 判断类型
    let type = "image";
    if (anchor.userData?.isModel) {
      type = "model";
    } else if (anchor.material?.map?.source?.data?.tagName === "VIDEO") {
      type = "video";
    }

    if (type === "image") {
      img.src =
        anchor.material?.map?.source?.data?.src ||
        "https://via.placeholder.com/40";
    } else if (type === "video") {
      img.src = "./video.svg";
      img.style.background = "#eee";
      img.style.objectFit = "contain";
    } else if (type === "model") {
      img.src = "./model.svg";
      img.style.background = "#eee";
      img.style.objectFit = "contain";
    }

    anchorItem.appendChild(img);

    const span = document.createElement("span");
    span.textContent = name;
    anchorItem.appendChild(span);

    anchorItem.addEventListener("click", () => {
      this.selectAnchor(anchor);
    });

    this.anchorList.appendChild(anchorItem);
    this.anchors.push(anchor); // 将anchor添加到数组
    this.selectAnchor(anchor); // 添加后默认选中
  }

  selectAnchor(anchor) {
    if (this.selectedAnchor === anchor) return;

    this.selectedAnchor = anchor;

    // 更新UI列表中的选中状态
    this.updateAnchorListSelection();

    // 调用anchorLoader来创建边框和控制点
    if (this.anchorLoader) {
      this.anchorLoader.createBorderLine(anchor);
    }

    // 更新信息显示
    this.infoController.updateInfo();
  }

  updateAnchorListSelection() {
    if (!this.anchorList) return;
    const selectedId = this.selectedAnchor ? this.selectedAnchor.uuid : null;

    Array.from(this.anchorList.children).forEach((child) => {
      if (child.dataset.anchorId === selectedId) {
        child.classList.add("selected");
      } else {
        child.classList.remove("selected");
      }
    });
  }
}

// 初始化编辑器
new Editor(document.getElementById("editor"));

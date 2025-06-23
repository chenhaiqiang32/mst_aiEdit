import * as THREE from "three";
import SpriteText from "three-spritetext";

export class TextureLoader {
  constructor(editor) {
    this.editor = editor;
    this.textureLoader = new THREE.TextureLoader();
  }

  cleanup() {
    // 移除旧的纹理网格
    if (this.editor.texture) {
      this.editor.scene.remove(this.editor.texture);
      this.editor.texture = null;
    }

    // 移除坐标轴
    if (this.editor.axesHelper) {
      this.editor.scene.remove(this.editor.axesHelper);
      this.editor.axesHelper = null;
    }

    // 移除像素刻度组
    if (this.editor.xMarkers) {
      this.editor.scene.remove(this.editor.xMarkers);
      this.editor.xMarkers = null;
    }
    if (this.editor.yMarkers) {
      this.editor.scene.remove(this.editor.yMarkers);
      this.editor.yMarkers = null;
    }

    // 移除像素刻度值元素
    if (this.editor.pixelMarkersContainer) {
      this.editor.pixelMarkersContainer.remove();
      this.editor.pixelMarkersContainer = null;
    }

    // 清除纹理边界框
    this.editor.textureBox = null;

    // 重置相机位置到默认位置
    if (this.editor.camera) {
      // 默认视角：中心 (0,0,1000)，朝向 (0,0,0)，正交参数重置
      this.editor.camera.left = -500;
      this.editor.camera.right = 500;
      this.editor.camera.top = 500;
      this.editor.camera.bottom = -500;
      this.editor.camera.position.set(0, 0, 1000);
      this.editor.camera.lookAt(0, 0, 0);
      this.editor.camera.updateProjectionMatrix();
    }
  }

  loadTexture(url) {
    console.log("Loading texture from URL:", url);

    // 在加载新纹理之前清理旧数据
    this.cleanup();

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          console.log("Texture loaded successfully:", texture);

          // 设置纹理过滤模式，防止放大时模糊
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy =
            this.editor.renderer.capabilities.getMaxAnisotropy();
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;

          // 获取图片原始尺寸（像素）
          const width = texture.image.width;
          const height = texture.image.height;
          console.log("Texture dimensions:", width, "x", height);

          // 创建几何体时直接使用像素尺寸
          const geometry = new THREE.PlaneGeometry(width, height);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            depthTest: true, // 禁用深度测试
            depthWrite: false, // 禁用深度写入
            alphaTest: 0.8,
          });
          const mesh = new THREE.Mesh(geometry, material);

          // 将纹理放置在左下角
          mesh.position.set(width / 2, height / 2, 0);
          this.editor.scene.add(mesh);
          this.editor.texture = mesh;
          mesh.renderOrder = -1;

          // 缓存纹理边界框
          this.editor.textureBox = new THREE.Box3().setFromObject(mesh);

          // 获取容器尺寸
          const container = document.getElementById("editor");
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;

          // 计算纹理在容器中的居中位置
          const centerX = containerWidth / 2;
          const centerY = containerHeight / 2;

          // 设置相机视锥体，保持纹理原始大小
          this.editor.camera.left = centerX - width / 2;
          this.editor.camera.right = centerX + width / 2;
          this.editor.camera.top = centerY + height / 2;
          this.editor.camera.bottom = centerY - height / 2;

          // 设置相机位置，使其正对纹理中心
          this.editor.camera.position.set(centerX, centerY, 1000);
          this.editor.camera.lookAt(centerX, centerY, 0);
          this.editor.camera.updateProjectionMatrix();

          // 更新渲染器尺寸
          this.editor.rendererController.updateRendererSize();

          // 更新坐标轴位置到纹理左下角
          const axesHelper = new THREE.AxesHelper(Math.max(width, height));
          axesHelper.position.set(0, 0, 0);
          this.editor.scene.add(axesHelper);
          this.editor.axesHelper = axesHelper;

          // 添加像素刻度
          const createPixelMarkers = (axis, length, step = 100) => {
            const markers = new THREE.Group();
            const material = new THREE.LineBasicMaterial({ color: 0xffffff });
            for (let i = 0; i <= length; i += step) {
              // 创建刻度线
              const points = [];
              if (axis === "x") {
                points.push(new THREE.Vector3(i, -10, 0));
                points.push(new THREE.Vector3(i, 10, 0));
              } else {
                points.push(new THREE.Vector3(-10, i, 0));
                points.push(new THREE.Vector3(10, i, 0));
              }
              const geometry = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(geometry, material);
              markers.add(line);

              // 添加刻度数字
              const textSprite = new SpriteText(
                i.toString() + "px",
                16,
                "#fff"
              );
              if (axis === "x") {
                textSprite.position.set(i, -24, 0); // 贴近X轴
              } else {
                textSprite.position.set(-40, i, 0); // 贴近Y轴，向左移动更多
              }
              markers.add(textSprite);
            }
            return markers;
          };

          const xMarkers = createPixelMarkers("x", width);
          const yMarkers = createPixelMarkers("y", height);
          this.editor.scene.add(xMarkers);
          this.editor.scene.add(yMarkers);
          this.editor.xMarkers = xMarkers;
          this.editor.yMarkers = yMarkers;

          resolve(mesh);
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        (error) => {
          console.error("Error loading texture:", error);
          reject(new Error("图片加载失败，请检查图片URL是否正确"));
        }
      );
    });
  }
}

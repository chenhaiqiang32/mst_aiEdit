import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";

export class RendererController {
  constructor(editor) {
    this.editor = editor;
    this.renderer = editor.renderer;
    this.initPostProcessing();
  }

  initPostProcessing() {
    // 创建后处理通道
    this.composer = new EffectComposer(this.renderer);

    // 添加渲染通道
    const renderPass = new RenderPass(this.editor.scene, this.editor.camera);
    this.composer.addPass(renderPass);
  }

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
    this.editor.containerSize.set(width, height);

    // 如果已经有纹理，重新调整相机
    if (this.editor.texture && this.editor.viewportSize) {
      this.editor.cameraController.adjustCameraToTexture(
        this.editor.texture.geometry.parameters.width,
        this.editor.texture.geometry.parameters.height
      );
      // 更新缓存的纹理边界框
      this.editor.textureBox = new THREE.Box3().setFromObject(
        this.editor.texture
      );
    }

    // 更新线条材质的分辨率
    if (this.editor.anchorLoader && this.editor.anchorLoader.lineMaterial) {
      this.editor.anchorLoader.lineMaterial.resolution.set(width, height);
    }
  }

  render() {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.editor.scene, this.editor.camera);
    }
  }
}

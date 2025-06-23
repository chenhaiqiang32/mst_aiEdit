export class CameraController {
  constructor(editor) {
    this.editor = editor;
    this.camera = editor.camera;
  }

  adjustCameraToTexture(textureWidth, textureHeight) {
    const container = document.getElementById("editor");
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // 计算纹理的宽高比
    const textureAspect = textureWidth / textureHeight;
    // 计算容器的宽高比
    const containerAspect = containerWidth / containerHeight;

    let cameraWidth, cameraHeight;

    if (textureAspect > containerAspect) {
      // 如果纹理更宽，以宽度为基准
      cameraWidth = textureWidth;
      cameraHeight = textureWidth / containerAspect;
    } else {
      // 如果纹理更高，以高度为基准
      cameraHeight = textureHeight;
      cameraWidth = textureHeight * containerAspect;
    }

    // 添加一些边距（10%）
    const margin = 1.1;
    cameraWidth *= margin;
    cameraHeight *= margin;

    // 更新相机参数，使纹理居中显示
    // 由于纹理左下角在原点，需要调整相机位置使纹理居中
    this.camera.left = -cameraWidth / 2;
    this.camera.right = cameraWidth / 2;
    this.camera.top = cameraHeight / 2;
    this.camera.bottom = -cameraHeight / 2;

    // 调整相机位置，使纹理居中
    this.camera.position.set(
      textureWidth / 2, // 水平居中
      textureHeight / 2, // 垂直居中
      1000 // 保持适当的z轴距离
    );

    this.camera.updateProjectionMatrix();

    // 保存当前视口大小
    this.editor.viewportSize = {
      width: cameraWidth,
      height: cameraHeight,
    };

    console.log("Camera adjusted:", {
      width: cameraWidth,
      height: cameraHeight,
      textureWidth,
      textureHeight,
      cameraPosition: this.camera.position,
    });
  }
}

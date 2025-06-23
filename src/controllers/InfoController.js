import * as THREE from "three";

export class InfoController {
  constructor(editor) {
    this.editor = editor;
  }

  updateInfo() {
    if (!this.editor.selectedAnchor || !this.editor.texture) return;

    const coordinates = document.getElementById("coordinates");
    const dimensions = document.getElementById("dimensions");

    // 获取纹理和标记物的边界框
    const textureBox = new THREE.Box3().setFromObject(this.editor.texture);
    const anchorBox = new THREE.Box3().setFromObject(
      this.editor.selectedAnchor
    );

    // 计算标记物左上角相对于纹理左上角的像素距离
    const relativeX = Math.round(anchorBox.min.x - textureBox.min.x);
    const relativeY = Math.round(textureBox.max.y - anchorBox.max.y);

    // 计算标记物当前的像素尺寸（考虑缩放）
    const width = Math.round(
      this.editor.originalAnchorSize.x * this.editor.selectedAnchor.scale.x
    );
    const height = Math.round(
      this.editor.originalAnchorSize.y * this.editor.selectedAnchor.scale.y
    );

    // 更新显示
    if (coordinates) {
      coordinates.textContent = `坐标: X: ${relativeX}px, Y: ${relativeY}px`;
    }
    if (dimensions) {
      dimensions.textContent = `尺寸: 宽: ${width}px, 高: ${height}px`;
    }
  }
}

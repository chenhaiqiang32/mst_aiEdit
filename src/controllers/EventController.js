import * as THREE from "three";
import { throttle } from "../utils/throttle";

export class EventController {
  constructor(editor) {
    this.editor = editor;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.isPanning = false;
    this.panStart = new THREE.Vector2();
    this.cameraStart = new THREE.Vector3();
    this.isScaling = false;
    this.scaleHandle = null;
    this.scaleStart = new THREE.Vector2();
    this.originalScale = 1;
    this.anchorCenter = new THREE.Vector3();
    this.initialMouseWorldPos = new THREE.Vector3();
    this.initialDistance = 1;

    // 拖拽相关变量
    this.dragStartWorldPos = new THREE.Vector3();
    this.dragStartAnchorPos = new THREE.Vector3();

    this.setupEventListeners();
  }

  setupEventListeners() {
    const dropZone = document.getElementById("dropZone");
    const uploadTexture = document.getElementById("uploadTexture");
    const uploadAnchor = document.getElementById("uploadAnchor");
    const saveBtn = document.getElementById("saveBtn");
    const clearBtn = document.getElementById("clearBtn");
    const editorContainer = document.getElementById("editor");

    // 拖拽事件 - dropZone区域
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.editor.handleFileUpload(files[0], "texture");
      }
    });

    // 场景拖拽事件 - 整个编辑器容器
    editorContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      // 如果dropZone可见，不处理场景拖拽
      if (dropZone.style.display !== "none") {
        return;
      }
      editorContainer.style.cursor = "copy";
    });

    editorContainer.addEventListener("dragleave", (e) => {
      // 只有当鼠标真正离开容器时才移除样式
      if (!editorContainer.contains(e.relatedTarget)) {
        editorContainer.style.cursor = "default";
      }
    });

    editorContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      editorContainer.style.cursor = "default";

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        // 获取拖拽位置
        const rect = editorContainer.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;

        // 将屏幕坐标转换为世界坐标
        const worldPos = this.screenToWorldPosition(dropX, dropY);

        // 检查文件类型，设置正确的z轴位置
        const fileName = files[0].name;
        const isModel = this.isModelFile(fileName);

        if (isModel) {
          worldPos.z = 200; // 3D模型放在z=200位置
        } else {
          worldPos.z = 0.1; // 2D标记物放在z=0.1位置
        }

        // 加载标记物并放置到指定位置
        this.editor.handleFileUpload(files[0], "anchor", worldPos);
      }
    });

    // 上传按钮事件
    uploadTexture.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        if (e.target.files.length > 0) {
          this.editor.handleFileUpload(e.target.files[0], "texture");
        }
      };
      input.click();
    });

    uploadAnchor.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,.glb,video/*";
      input.onchange = (e) => {
        if (e.target.files.length > 0) {
          this.editor.handleFileUpload(e.target.files[0], "anchor");
        }
      };
      input.click();
    });

    // 保存按钮事件
    saveBtn.addEventListener("click", () => this.editor.save());

    // 清空按钮事件
    clearBtn.addEventListener("click", () => this.editor.clearCanvas());

    // 鼠标事件
    this.editor.renderer.domElement.addEventListener("mousedown", (e) =>
      this.onMouseDown(e)
    );
    this.editor.renderer.domElement.addEventListener("mousemove", (e) =>
      this.onMouseMove(e)
    );
    this.editor.renderer.domElement.addEventListener("mouseup", () =>
      this.onMouseUp()
    );
    this.editor.renderer.domElement.addEventListener("wheel", (e) =>
      this.onMouseWheel(e)
    );

    // 键盘事件
    window.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // 检查是否有标记物且标记物有边框线（表示被选中）
        if (this.editor.selectedAnchor && this.editor.borderLine) {
          this.editor.deleteAnchor();
        }
      }
    });

    // 窗口大小变化监听
    window.addEventListener("resize", () =>
      this.editor.rendererController.updateRendererSize()
    );
  }

  onMouseDown(event) {
    // 计算鼠标在归一化设备坐标中的位置
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.editor.camera);

    // 首先检查是否点击了缩放控制点
    if (this.editor.scaleHandles && this.editor.scaleHandles.length > 0) {
      const handleIntersects = this.raycaster.intersectObjects(
        this.editor.scaleHandles
      );
      if (handleIntersects.length > 0) {
        console.log("Scale handle clicked:", handleIntersects[0].object);
        this.scaleHandle = handleIntersects[0].object;
        this.isScaling = true;
        this.scaleStart.set(event.clientX, event.clientY);

        // 确保拖动状态为false，避免冲突
        this.editor.isDragging = false;

        this.originalScale = this.editor.selectedAnchor.scale.x;
        // 计算标记物中心点
        const box = new THREE.Box3().setFromObject(this.editor.selectedAnchor);
        box.getCenter(this.anchorCenter);

        // 记录初始鼠标世界坐标
        this.initialMouseWorldPos = this.getMouseWorldPosition(event);

        // 根据标记物类型调整初始鼠标位置到正确的z平面
        const modelZ = this.getZPositionForAnchor(this.editor.selectedAnchor);
        const adjustedInitialMousePos = new THREE.Vector3(
          this.initialMouseWorldPos.x,
          this.initialMouseWorldPos.y,
          modelZ
        );

        // 记录初始距离（在正确的z平面上计算）
        this.initialDistance = adjustedInitialMousePos.distanceTo(
          this.anchorCenter
        );

        console.log("Scale start - Original scale:", this.originalScale);
        console.log("Scale start - Anchor center:", this.anchorCenter);
        console.log(
          "Scale start - Initial mouse world pos:",
          this.initialMouseWorldPos
        );
        console.log("Scale start - Initial distance:", this.initialDistance);

        return;
      }
    }

    // 改进的标记物检测逻辑
    let selectedAnchor = null;

    // 方法1：直接检测所有标记物（包括Group）
    const intersects = this.raycaster.intersectObjects(
      this.editor.anchors,
      true
    );
    console.log("Direct intersects:", intersects);

    if (intersects.length > 0) {
      const selectedObject = intersects[0].object;

      // 如果点击的是组内的对象，获取其父组
      let anchor = selectedObject;
      while (anchor.parent && !this.editor.anchors.includes(anchor)) {
        anchor = anchor.parent;
      }

      // 确保选中的是标记物
      if (this.editor.anchors.includes(anchor)) {
        selectedAnchor = anchor;
        console.log("Found valid anchor via direct detection:", anchor);
      }
    }

    // 方法2：如果直接检测失败，尝试检测标记物的边界框
    if (!selectedAnchor) {
      for (const anchor of this.editor.anchors) {
        const box = new THREE.Box3().setFromObject(anchor);
        const mouseWorldPos = this.getMouseWorldPosition(event);

        // 检查鼠标是否在标记物的边界框内
        if (box.containsPoint(mouseWorldPos)) {
          selectedAnchor = anchor;
          console.log("Found valid anchor via bounding box detection:", anchor);
          break;
        }
      }
    }

    if (selectedAnchor) {
      console.log("Anchor selected:", selectedAnchor);

      // 更新选中的标记物
      if (this.editor.selectedAnchor !== selectedAnchor) {
        this.editor.selectedAnchor = selectedAnchor;

        // 更新边框线
        if (this.editor.anchorLoader) {
          this.editor.anchorLoader.createBorderLine(selectedAnchor);
        }

        // 更新顶部坐标和尺寸显示
        this.editor.infoController.updateInfo();

        // 同步更新UI列表
        this.editor.updateAnchorListSelection();
      }

      // 只有在不是缩放状态时才设置拖动状态
      if (!this.isScaling) {
        console.log("Starting drag");
        this.editor.isDragging = true;

        // 记录鼠标点击时的世界坐标和标记物位置
        this.dragStartWorldPos = this.getMouseWorldPosition(event);
        this.dragStartAnchorPos = selectedAnchor.position.clone();
      }
    } else {
      // 没有选中 anchor，进入场景拖动模式
      this.isPanning = true;
      this.panStart.set(event.clientX, event.clientY);
      this.cameraStart.copy(this.editor.camera.position);
      // 取消选中
      if (this.editor.selectedAnchor) {
        if (this.editor.borderLine) {
          this.editor.scene.remove(this.editor.borderLine);
          this.editor.borderLine = null;
        }
        if (this.editor.glowBorderLine) {
          this.editor.scene.remove(this.editor.glowBorderLine);
          this.editor.glowBorderLine = null;
        }
        // 移除缩放控制点
        if (this.editor.scaleHandles) {
          this.editor.scaleHandles.forEach((handle) => {
            this.editor.scene.remove(handle);
          });
          this.editor.scaleHandles = [];
        }
        this.editor.selectedAnchor = null;
        // 同步更新UI列表
        this.editor.updateAnchorListSelection();
      }
    }
  }

  onMouseMove(event) {
    // 更新鼠标位置
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // 更新射线
    this.raycaster.setFromCamera(this.mouse, this.editor.camera);

    // 检查鼠标悬停在缩放控制点上
    if (this.editor.selectedAnchor && this.editor.scaleHandles) {
      const handleIntersects = this.raycaster.intersectObjects(
        this.editor.scaleHandles
      );
      if (handleIntersects.length > 0) {
        // 鼠标悬停在控制点上，根据控制点位置改变鼠标样式
        const cursorStyle = this.getCursorStyleForHandle(
          handleIntersects[0].object
        );
        this.editor.renderer.domElement.style.cursor = cursorStyle;
      } else {
        // 检查是否在标记物上或附近
        let isOnAnchor = false;

        // 方法1：直接射线检测
        const anchorIntersects = this.raycaster.intersectObject(
          this.editor.selectedAnchor,
          true
        );
        if (anchorIntersects.length > 0) {
          isOnAnchor = true;
        }

        // 方法2：如果直接检测失败，检查边界框
        if (!isOnAnchor) {
          const mouseWorldPos = this.getMouseWorldPosition(event);
          const anchorBox = new THREE.Box3().setFromObject(
            this.editor.selectedAnchor
          );
          if (anchorBox.containsPoint(mouseWorldPos)) {
            isOnAnchor = true;
          }
        }

        if (isOnAnchor) {
          // 鼠标在标记物上，显示move样式
          this.editor.renderer.domElement.style.cursor = "move";
        } else {
          // 检查是否在标记物范围内
          const mouseWorldPos = this.getMouseWorldPosition(event);
          const anchorBox = new THREE.Box3().setFromObject(
            this.editor.selectedAnchor
          );
          const anchorCenter = new THREE.Vector3();
          anchorBox.getCenter(anchorCenter);

          const distance = mouseWorldPos.distanceTo(anchorCenter);
          console.log(
            "Distance check - Mouse pos:",
            mouseWorldPos,
            "Anchor center:",
            anchorCenter,
            "Distance:",
            distance
          );

          // 调整距离阈值，使用更小的值进行测试
          const snapDistance = 10; // 先使用100像素进行测试
          if (distance <= snapDistance) {
            // 在范围内，根据最近的控制点显示对应的resize样式
            console.log(
              "In snap range - distance:",
              distance,
              "threshold:",
              snapDistance
            );
            const cursorStyle =
              this.getCursorStyleForMousePosition(mouseWorldPos);
            this.editor.renderer.domElement.style.cursor = cursorStyle;
            this.autoSnapToHandle(mouseWorldPos);
          } else {
            this.editor.renderer.domElement.style.cursor = "default";
          }
        }
      }
    } else if (this.editor.selectedAnchor) {
      // 有选中的标记物但没有控制点，显示move样式
      this.editor.renderer.domElement.style.cursor = "move";
    } else {
      // 没有选中的标记物，显示默认样式
      this.editor.renderer.domElement.style.cursor = "default";
    }

    // 拖动画布（相机）优先判断
    if (this.isPanning) {
      const deltaX = event.clientX - this.panStart.x;
      const deltaY = event.clientY - this.panStart.y;
      // 计算相机平移量（与正交相机视口尺寸相关）
      const camera = this.editor.camera;
      const width = rect.width;
      const height = rect.height;
      const viewWidth = camera.right - camera.left;
      const viewHeight = camera.top - camera.bottom;
      const moveX = -(deltaX / width) * viewWidth;
      const moveY = (deltaY / height) * viewHeight;
      camera.position.x = this.cameraStart.x + moveX;
      camera.position.y = this.cameraStart.y + moveY;
      camera.updateProjectionMatrix();
      return;
    }

    // 缩放处理
    if (this.isScaling && this.scaleHandle && this.editor.selectedAnchor) {
      // 当前鼠标世界坐标
      const currentMouseWorldPos = this.getMouseWorldPosition(event);

      // 根据标记物类型调整鼠标位置到正确的z平面
      const modelZ = this.getZPositionForAnchor(this.editor.selectedAnchor);
      const adjustedMousePos = new THREE.Vector3(
        currentMouseWorldPos.x,
        currentMouseWorldPos.y,
        modelZ
      );

      // 当前距离（在正确的z平面上计算）
      const currentDistance = adjustedMousePos.distanceTo(this.anchorCenter);

      // 缩放比
      let scaleRatio = currentDistance / this.initialDistance;

      // 限制最小缩放
      scaleRatio = Math.max(0.1, scaleRatio);

      console.log(
        "Scaling - Current distance:",
        currentDistance,
        "Initial distance:",
        this.initialDistance,
        "Scale ratio:",
        scaleRatio,
        "Model Z:",
        modelZ
      );

      // 应用等比缩放
      if (this.isModelAnchor(this.editor.selectedAnchor)) {
        // 3D模型，xyz等比缩放
        const newScale = this.originalScale * scaleRatio;
        this.editor.selectedAnchor.scale.set(newScale, newScale, newScale);
        console.log(
          "3D Model scaling - Original scale:",
          this.originalScale,
          "New scale:",
          newScale
        );
      } else {
        // 2D标记物：使用当前缩放值乘以缩放比
        const newScale = this.originalScale * scaleRatio;
        this.editor.selectedAnchor.scale.set(newScale, newScale, 1);
        console.log(
          "2D Anchor scaling - Original scale:",
          this.originalScale,
          "New scale:",
          newScale
        );
      }

      // 实时更新边框线和缩放控制点
      if (this.editor.anchorLoader) {
        this.editor.anchorLoader.createBorderLine(this.editor.selectedAnchor);
      }

      // 让当前拖拽的控制点实时跟随鼠标
      if (this.scaleHandle) {
        // 根据标记物类型设置控制点的z轴位置
        const handleZ = this.getZPositionForAnchor(
          this.editor.selectedAnchor,
          0.2
        );

        this.scaleHandle.position.set(
          currentMouseWorldPos.x,
          currentMouseWorldPos.y,
          handleZ
        );
      }

      // 更新坐标显示
      this.editor.infoController.updateInfo();
      return;
    }

    // 拖动锚点
    if (!this.editor.selectedAnchor || !this.editor.texture) return;
    if (this.editor.isDragging && !this.isScaling) {
      console.log(
        "Dragging anchor - isDragging:",
        this.editor.isDragging,
        "isScaling:",
        this.isScaling
      );

      // 获取当前鼠标的世界坐标
      const currentMouseWorldPos = this.getMouseWorldPosition(event);

      // 计算鼠标移动的世界坐标偏移量
      const worldDeltaX = currentMouseWorldPos.x - this.dragStartWorldPos.x;
      const worldDeltaY = currentMouseWorldPos.y - this.dragStartWorldPos.y;

      // 计算新位置：起始位置 + 偏移量
      const newX = this.dragStartAnchorPos.x + worldDeltaX;
      const newY = this.dragStartAnchorPos.y + worldDeltaY;

      // 根据标记物类型设置z轴位置
      const newZ = this.getZPositionForAnchor(this.editor.selectedAnchor);

      // 设置标记物位置
      this.editor.selectedAnchor.position.set(newX, newY, newZ);

      // 实时更新边框线
      if (this.editor.anchorLoader) {
        this.editor.anchorLoader.createBorderLine(this.editor.selectedAnchor);
      }

      // 更新坐标显示
      this.editor.infoController.updateInfo();
    }
  }

  onMouseUp() {
    if (this.isScaling && this.scaleHandle) {
      console.log("Scale end - Final scale:", this.editor.selectedAnchor.scale);
      console.log(
        "Scale end - Scale ratio applied:",
        this.editor.selectedAnchor.scale.x / this.originalScale
      );

      // 缩放结束后，重置拖动状态，避免后续拖动时出现问题
      this.editor.isDragging = false;
    }

    // 重置所有状态
    this.isPanning = false;
    this.isScaling = false;
    this.scaleHandle = null;
    this.editor.isDragging = false;

    console.log("Mouse up - All states reset");
  }

  onMouseWheel(event) {
    // 如果按住Ctrl键且有选中的标记物，则缩放标记物
    if (event.ctrlKey && this.editor.selectedAnchor) {
      // 更新鼠标位置
      const rect = this.editor.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // 更新射线
      this.raycaster.setFromCamera(this.mouse, this.editor.camera);

      // 检测射线与选中标记物的相交
      let shouldScale = false;

      // 方法1：直接射线检测
      const intersects = this.raycaster.intersectObject(
        this.editor.selectedAnchor,
        true
      );
      if (intersects.length > 0) {
        shouldScale = true;
      }

      // 方法2：如果直接检测失败，检查边界框
      if (!shouldScale) {
        const mouseWorldPos = this.getMouseWorldPosition(event);
        const anchorBox = new THREE.Box3().setFromObject(
          this.editor.selectedAnchor
        );
        if (anchorBox.containsPoint(mouseWorldPos)) {
          shouldScale = true;
        }
      }

      if (shouldScale) {
        // 计算缩放比例
        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(
          0.1,
          this.editor.selectedAnchor.scale.x * scaleFactor
        );

        // 判断是否为3D模型
        if (this.isModelAnchor(this.editor.selectedAnchor)) {
          // 3D模型，xyz等比缩放
          this.editor.selectedAnchor.scale.set(newScale, newScale, newScale);
        } else {
          // 2D图片，z方向为1
          this.editor.selectedAnchor.scale.set(newScale, newScale, 1);
        }

        // 实时更新边框线
        if (this.editor.anchorLoader) {
          this.editor.anchorLoader.createBorderLine(this.editor.selectedAnchor);
        }

        // 直接调用 updateInfo 方法更新信息
        this.editor.infoController.updateInfo();
      }
    } else {
      // 否则缩放相机
      const zoomSpeed = 0.1;
      const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

      // 限制缩放范围
      const newZoom = Math.max(
        0.1,
        Math.min(10, this.editor.camera.zoom * delta)
      );

      // 更新相机缩放
      this.editor.camera.zoom = newZoom;
      this.editor.camera.updateProjectionMatrix();
    }
  }

  // 获取鼠标在世界坐标中的位置
  getMouseWorldPosition(event) {
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      new THREE.Vector2(mouseX, mouseY),
      this.editor.camera
    );

    // 计算鼠标射线与Z=0平面的交点
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersectionPoint);

    return intersectionPoint;
  }

  // 自动吸附到最近的控制点
  autoSnapToHandle(mouseWorldPos) {
    if (!this.editor.scaleHandles || this.editor.scaleHandles.length === 0)
      return;

    let closestHandle = null;
    let minDistance = Infinity;

    this.editor.scaleHandles.forEach((handle) => {
      const handlePos = handle.userData.originalPosition;
      // 根据标记物类型设置控制点的z轴位置
      const handleZ = this.getZPositionForAnchor(this.editor.selectedAnchor, 0);
      const handleWorldPos = new THREE.Vector3(
        handlePos.x,
        handlePos.y,
        handleZ
      );
      const distance = mouseWorldPos.distanceTo(handleWorldPos);
      console.log(
        "Handle distance check - Handle:",
        handle.userData.cornerName,
        "Distance:",
        distance
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestHandle = handle;
      }
    });

    console.log(
      "Closest handle:",
      closestHandle?.userData.cornerName,
      "Distance:",
      minDistance
    );

    if (closestHandle && minDistance <= 100) {
      // 使用相同的距离阈值
      // 高亮最近的控制点
      console.log("Highlighting handle:", closestHandle.userData.cornerName);
      closestHandle.material.color.setHex(0x00ff00); // 绿色高亮
    }
  }

  // 根据控制点位置返回正确的光标样式
  getCursorStyleForHandle(handle) {
    if (!handle || !handle.userData) return "nw-resize";

    const cornerName = handle.userData.cornerName;
    switch (cornerName) {
      case "topLeft": // 左上角
      case "bottomRight": // 右下角
        return "nwse-resize";
      case "topRight": // 右上角
      case "bottomLeft": // 左下角
        return "nesw-resize";
      default:
        return "nw-resize";
    }
  }

  // 根据鼠标位置返回最近控制点的光标样式
  getCursorStyleForMousePosition(mouseWorldPos) {
    if (!this.editor.scaleHandles || this.editor.scaleHandles.length === 0) {
      return "nw-resize";
    }

    let closestHandle = null;
    let minDistance = Infinity;

    this.editor.scaleHandles.forEach((handle) => {
      const handlePos = handle.userData.originalPosition;
      // 根据标记物类型设置控制点的z轴位置
      const handleZ = this.getZPositionForAnchor(this.editor.selectedAnchor, 0);
      const handleWorldPos = new THREE.Vector3(
        handlePos.x,
        handlePos.y,
        handleZ
      );
      const distance = mouseWorldPos.distanceTo(handleWorldPos);

      if (distance < minDistance) {
        minDistance = distance;
        closestHandle = handle;
      }
    });

    if (closestHandle) {
      return this.getCursorStyleForHandle(closestHandle);
    }

    return "nw-resize";
  }

  // 新增：将屏幕坐标转换为世界坐标
  screenToWorldPosition(screenX, screenY) {
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    const mouseX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((screenY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      new THREE.Vector2(mouseX, mouseY),
      this.editor.camera
    );

    // 计算鼠标射线与Z=0平面的交点
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersectionPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersectionPoint);

    return intersectionPoint;
  }

  // 辅助方法：判断标记物是否为3D模型
  isModelAnchor(anchor) {
    return anchor && anchor.userData && anchor.userData.isModel;
  }

  // 辅助方法：根据标记物类型获取z轴位置
  getZPositionForAnchor(anchor, baseZ = 0.1) {
    if (this.isModelAnchor(anchor)) {
      return 200 + (baseZ - 0.1); // 3D模型基础位置200，然后加上偏移
    }
    return baseZ; // 2D标记物使用传入的基础位置
  }

  // 辅助方法：判断文件是否为3D模型
  isModelFile(fileName) {
    const name = fileName.toLowerCase();
    return name.endsWith(".glb") || name.endsWith(".gltf");
  }
}

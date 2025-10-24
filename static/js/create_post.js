// Create Post Page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // --- 텍스트 미리보기 로직 ---
    const titleInput = document.getElementById('title');
    const contentInput = document.getElementById('content');
    const previewTitle = document.getElementById('previewTitle');
    const previewContent = document.getElementById('previewContent');

    function updateTextPreview() {
        if (previewTitle) {
            previewTitle.textContent = titleInput.value.trim() || '제목이 여기에 표시됩니다';
        }
        if (previewContent) {
            // [수정] \n을 <br>로 변환하여 미리보기에 즉시 반영
            const contentHtml = contentInput.value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\n/g, '<br>');
            previewContent.innerHTML = contentHtml || '<p>내용이 여기에 표시됩니다.</p>';
        }
    }

    if (titleInput) titleInput.addEventListener('input', updateTextPreview);
    if (contentInput) contentInput.addEventListener('input', updateTextPreview);

    // 초기 로드 시 텍스트 미리보기 실행
    updateTextPreview();

    // --- [신규] 이미지 미리보기 로직 (UI/UX 개선) ---
    const imageInput = document.getElementById('imageUpload');
    const previewGrid = document.getElementById('imagePreviewGrid');
    const noImageText = document.getElementById('noImageText');
    const limitMessage = document.getElementById('imageLimitMessage');
    const MAX_IMAGES = parseInt(imageInput?.dataset.maxImages || "3", 10);

    if (imageInput && previewGrid && noImageText && limitMessage) {
        imageInput.addEventListener('change', handleImagePreview);
    }

    function handleImagePreview(event) {
        // 1. 상태 초기화
        previewGrid.innerHTML = '';
        limitMessage.classList.remove('visible');
        noImageText.classList.remove('visible');

        let files = Array.from(event.target.files);

        // 2. 이미지 개수 제한 검사
        if (files.length > MAX_IMAGES) {
            limitMessage.classList.add('visible');
            // 허용된 개수만큼 파일 배열을 자름
            files = files.slice(0, MAX_IMAGES);
        }

        // 3. 파일이 없는 경우
        if (files.length === 0) {
            noImageText.classList.add('visible');
            return;
        }

        // 4. 선택된 파일 미리보기 생성
        files.forEach(file => {
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = function(e) {
                    // 프리뷰 아이템 컨테이너
                    const item = document.createElement('div');
                    item.classList.add('image-preview-item');

                    // 이미지 태그
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = file.name;

                    // 파일명 표시
                    const filename = document.createElement('span');
                    filename.classList.add('image-filename');
                    filename.textContent = file.name;

                    item.appendChild(img);
                    item.appendChild(filename);
                    previewGrid.appendChild(item);
                }

                reader.readAsDataURL(file);
            }
        });
    }

});

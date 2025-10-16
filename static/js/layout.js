document.addEventListener('DOMContentLoaded', () => {
    // --- 사이드바 토글 기능 ---
    const leftSidebarToggle = document.getElementById('leftSidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const sidebarLeft = document.getElementById('sidebarLeft');
    const sidebarRight = document.getElementById('sidebarRight');

    if (leftSidebarToggle && sidebarLeft) {
        leftSidebarToggle.addEventListener('click', () => {
            sidebarLeft.classList.toggle('collapsed');
        });
    }

    if (rightSidebarToggle && sidebarRight) {
        rightSidebarToggle.addEventListener('click', () => {
            sidebarRight.classList.toggle('expanded');
        });
    }
});
// sw.js – 생일 알림 Service Worker
// 매일 오전 8시에 "내일 생일인 가족"을 확인해서 푸시 알림을 보냅니다.

const SW_VERSION = 'v1.0.0';

// ───────────────────────────────────────────
// 설치 & 활성화
// ───────────────────────────────────────────
self.addEventListener('install', (event) => {
    console.log('[SW] 설치됨', SW_VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] 활성화됨', SW_VERSION);
    event.waitUntil(clients.claim());
    // 활성화되면 바로 일일 체크 타이머 시작
    scheduleNextDailyCheck();
});

// ───────────────────────────────────────────
// 메인 앱에서 생일 데이터 수신
// ───────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_BIRTHDAY_CHECK') {
        const birthdays = event.data.birthdays || [];
        // IndexedDB 대신 간단히 전역 변수에 보관
        self.__birthdays = birthdays;
        console.log('[SW] 생일 데이터 수신:', birthdays.length, '건');
    }
});

// ───────────────────────────────────────────
// 음력 → 양력 변환 (SW 내에서는 lunar-javascript 못 씀)
// 주요 로직: 날짜 비교는 양력 기준으로만 처리
// 음력 생일은 앱에서 미리 계산한 solar 날짜를 캐시에 담아야 하지만
// 여기선 birthDate(양력 저장값)를 그대로 씁니다.
// ───────────────────────────────────────────
function getSolarBirthday(birthDateStr) {
    // birthDateStr: "YYYY-MM-DD"
    const [, month, day] = birthDateStr.split('-').map(Number);
    const year = new Date().getFullYear();
    return new Date(year, month - 1, day);
}

function isTomorrow(date) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return (
        date.getFullYear() === tomorrow.getFullYear() &&
        date.getMonth()    === tomorrow.getMonth()    &&
        date.getDate()     === tomorrow.getDate()
    );
}

// ───────────────────────────────────────────
// 생일 체크 & 알림 발송
// ───────────────────────────────────────────
async function checkAndNotify() {
    const birthdays = self.__birthdays || [];
    console.log('[SW] 생일 체크 시작. 데이터:', birthdays.length, '건');

    for (const { name, birthDate } of birthdays) {
        const solar = getSolarBirthday(birthDate);
        if (isTomorrow(solar)) {
            const monthDay = `${solar.getMonth() + 1}월 ${solar.getDate()}일`;
            await self.registration.showNotification(`🎂 내일은 ${name}의 생일이에요!`, {
                body: `${monthDay}을 잊지 마세요 💝 미리 준비해 두세요!`,
                icon: '/android-chrome-192x192.png',
                badge: '/favicon-32x32.png',
                tag: `birthday-${name}-${birthDate}`,
                requireInteraction: true,
                vibrate: [200, 100, 200],
                data: { url: self.registration.scope }
            });
            console.log('[SW] 알림 발송:', name);
        }
    }
}

// ───────────────────────────────────────────
// 매일 오전 8시 타이머 스케줄링
// ───────────────────────────────────────────
function scheduleNextDailyCheck() {
    const now = new Date();
    const next8am = new Date(now);
    next8am.setHours(8, 0, 0, 0);

    // 이미 오전 8시가 지났으면 내일 오전 8시로
    if (now >= next8am) {
        next8am.setDate(next8am.getDate() + 1);
    }

    const delay = next8am - now;
    const hours = Math.floor(delay / 1000 / 60 / 60);
    const mins  = Math.floor((delay / 1000 / 60) % 60);
    console.log(`[SW] 다음 체크까지: ${hours}시간 ${mins}분 후 (${next8am.toLocaleString('ko-KR')})`);

    setTimeout(async () => {
        await checkAndNotify();
        scheduleNextDailyCheck(); // 다음날 오전 8시 재등록
    }, delay);
}

// ───────────────────────────────────────────
// 알림 클릭 시 앱 열기
// ───────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.startsWith(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});

// AT Ops Push Notification Service Worker
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "AT Dispatch", body: "New flight alert" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag ?? "at-ops-alert",
      requireInteraction: true,
      data: { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});

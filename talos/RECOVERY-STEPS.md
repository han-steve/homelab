# M2 Node Recovery Steps
# USB: Talos v1.13.2 secureboot ISO flashed to USB

## 1. Boot M2 from USB
- Plug USB into M2
- Power on, hit F7 (or F11/Del) for boot menu
- Select USB drive
- Secure Boot is in Setup Mode â†’ Talos will auto-enroll its signing keys
- Wait for Talos maintenance mode to appear on screen

## 2. Find the DHCP IP the USB got
```
arp -a | grep "84:47"
# Or check AT&T router device list at http://192.168.1.254
```

## 3. Apply the config (use whatever IP arp shows)
```
talosctl apply-config \
  --nodes 192.168.1.XXX \
  --endpoints 192.168.1.XXX \
  --file talos/controlplane.yaml \
  --insecure
```

## 4. Watch the install
```
talosctl dmesg --nodes 192.168.1.XXX --insecure -f
```
(Talos will install to /dev/nvme0n1, reboot to .50)

## 5. After reboot to 192.168.1.50
```
# Wait ~60s for boot, then:
talosctl version --nodes 192.168.1.50
talosctl bootstrap --nodes 192.168.1.50    # Only if etcd not already bootstrapped!
talosctalosctalosctalosctalosctalosctalos--force
kubectl get nodes
```


``
ctl get nodes
talosootalosootalosootalosootalosootalosootalosootalosus --nodes 192.168.1.50 2>&1 | head -5
# If it shows a healthy member: skip bootstrap
# If er# If er# If er# Ip
# If er# If er# If er# Ip
mber: skip bootstrap
ootalosus --nodes 192.168.68ootalosus --nodes 192.168.68ootalosus --nodes 192.1dd reservation
  - MAC: 84:47:09:6A:91:   â  - MAC: 84:47:09:0, Name: m2

/*
Copyright 2026 Kicya

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

const BLOCKED_IPV4_RANGES = [
    { start: '0.0.0.0', end: '0.255.255.255' },
    { start: '10.0.0.0', end: '10.255.255.255' },
    { start: '100.64.0.0', end: '100.127.255.255' },      // Carrier-grade NAT
    { start: '127.0.0.0', end: '127.255.255.255' },
    { start: '169.254.0.0', end: '169.254.255.255' },
    { start: '172.16.0.0', end: '172.31.255.255' },
    { start: '192.0.0.0', end: '192.0.0.255' },           // IETF protocol assignments
    { start: '192.0.2.0', end: '192.0.2.255' },           // TEST-NET-1
    { start: '192.88.99.0', end: '192.88.99.255' },       // 6to4 relay
    { start: '192.168.0.0', end: '192.168.255.255' },
    { start: '198.18.0.0', end: '198.19.255.255' },       // Benchmarking
    { start: '198.51.100.0', end: '198.51.100.255' },     // TEST-NET-2
    { start: '203.0.113.0', end: '203.0.113.255' },       // TEST-NET-3
    { start: '224.0.0.0', end: '239.255.255.255' },       // Multicast
    { start: '240.0.0.0', end: '255.255.255.255' },       // Reserved
];

const BLOCKED_IPV6_RANGES = [
    { start: '::', end: '::' },                                             // Unspecified
    { start: '::1', end: '::1' },                                           // Loopback
    { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },    // Unique local
    { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },    // Link-local
    { start: 'ff00::', end: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },    // Multicast
    { start: '2001:db8::', end: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff' }, // Documentation
    { start: '100::', end: '100::ffff:ffff:ffff:ffff' },                    // Discard
].map(r => ({ start: ipv6ToBigInt(r.start), end: ipv6ToBigInt(r.end) }));

function ip4ToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function expandIPv6(ip) {
    // Handle ::
    const halves = ip.split('::');
    let groups;
    if (halves.length === 2) {
        const left = halves[0] ? halves[0].split(':') : [];
        const right = halves[1] ? halves[1].split(':') : [];
        const missing = 8 - left.length - right.length;
        groups = [...left, ...Array(missing).fill('0'), ...right];
    } else {
        groups = ip.split(':');
    }
    return groups.map(g => g.padStart(4, '0')).join(':');
}

function ipv6ToBigInt(ip) {
    // Handle IPv4-mapped like ::ffff:192.168.1.1
    const v4match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4match) {
        const v4 = ip4ToInt(v4match[1]);
        return BigInt('0xffff') * BigInt(2 ** 32) + BigInt(v4);
    }

    const expanded = expandIPv6(ip);
    const hex = expanded.replace(/:/g, '');
    return BigInt('0x' + hex);
}

/** IPv4-mapped IPv6 (::ffff:a.b.c.d or canonical ::ffff:w:x with two hextets). */
function ipv4FromIPv4MappedIPv6(ip) {
    if (!net.isIPv6(ip)) return null;
    const expanded = expandIPv6(ip);
    const parts = expanded.split(':');
    if (parts.length !== 8) return null;
    const p = parts.map((x) => parseInt(x, 16));
    if (!(p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 0 && p[4] === 0 && p[5] === 0xffff)) {
        return null;
    }
    const hi = p[6];
    const lo = p[7];
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isBlockedIP(ip) {
    if (net.isIPv4(ip)) {
        const n = ip4ToInt(ip);
        return BLOCKED_IPV4_RANGES.some(r => n >= ip4ToInt(r.start) && n <= ip4ToInt(r.end));
    }

    if (net.isIPv6(ip)) {
        // Check for IPv4-mapped IPv6 (::ffff:x.x.x.x)
        const v4match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (v4match) return isBlockedIP(v4match[1]);

        const v4fromMapped = ipv4FromIPv4MappedIPv6(ip);
        if (v4fromMapped) return isBlockedIP(v4fromMapped);

        const n = ipv6ToBigInt(ip);
        return BLOCKED_IPV6_RANGES.some(r => n >= r.start && n <= r.end);
    }

    return true; // block anything we can't parse
}

export async function validateUrl(urlString) {
    let parsed;
    try {
        parsed = new URL(urlString);
    } catch {
        throw new Error('Invalid URL');
    }

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS are allowed');
    }

    let host = parsed.hostname;
    if (host.length >= 2 && host[0] === '[' && host[host.length - 1] === ']') {
        host = host.slice(1, -1);
    }

    // Block IP addresses directly in the URL
    if (net.isIP(host)) {
        if (isBlockedIP(host)) {
            throw new Error('Fetching private/internal IPs is not allowed');
        }
        return parsed.toString();
    }

    // Resolve hostname and check IP
    const { address } = await dns.lookup(host);
    if (isBlockedIP(address)) {
        throw new Error('Fetching private/internal IPs is not allowed');
    }

    return parsed.toString();
}
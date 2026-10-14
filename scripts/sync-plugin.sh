#!/bin/bash
# 开发辅助：把源码硬链接到某个 profile 的 node_modules
#
# 场景：插件源码在别处开发，profile 通过链接方式加载，
# 而编辑器的「替换文件」保存方式会打断硬链接（inode 变化），
# 导致 profile 实际加载的仍是旧副本。本脚本负责重建并校验。
#
# 用法:
#   bash scripts/sync-plugin.sh <profile名> [源码目录]
#
# 例:
#   bash scripts/sync-plugin.sh web
#   bash scripts/sync-plugin.sh glossary-test /path/to/plugin
#
# 省略源码目录时，默认用本仓库根目录。
set -euo pipefail

PROFILE="${1:-}"
if [ -z "$PROFILE" ]; then
  echo "用法: bash scripts/sync-plugin.sh <profile名> [源码目录]"
  echo "例:   bash scripts/sync-plugin.sh web"
  exit 1
fi

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${2:-$REPO}"
DST="${DSH_HOME:-$HOME/.dsh}/profiles/$PROFILE/node_modules/dsh-client-term-glossary"

[ -d "$SRC/lib" ] || { echo "❌ 源码目录无 lib/: $SRC"; exit 1; }
[ -d "$DST" ] || { echo "❌ 目标插件目录不存在（该 profile 未安装本插件？）: $DST"; exit 1; }

echo "源码: $SRC"
echo "目标: $DST"
echo

for f in client.js index.js; do
  [ -f "$SRC/lib/$f" ] || { echo "⚠️  缺少 lib/$f，跳过"; continue; }
  rm -f "$DST/lib/$f"
  ln "$SRC/lib/$f" "$DST/lib/$f"
  a=$(md5sum "$SRC/lib/$f" | cut -d' ' -f1)
  b=$(md5sum "$DST/lib/$f" | cut -d' ' -f1)
  ia=$(stat -c %i "$SRC/lib/$f"); ib=$(stat -c %i "$DST/lib/$f")
  if [ "$a" = "$b" ] && [ "$ia" = "$ib" ]; then
    echo "✅ $f  同步OK  inode=$ia  md5=${a:0:12}"
  else
    echo "❌ $f  不一致！src=$ia/$a  dst=$ib/$b"
    exit 1
  fi
done

echo
echo "提示：若该 profile 用的是 npm 安装（真实副本而非硬链接），"
echo "      本脚本不适用，请改用 npm install 或重新部署。"

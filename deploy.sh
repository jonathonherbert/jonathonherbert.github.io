#!/bin/sh

set -e

git branch -D draft 2>/dev/null || true && \
	git branch -D master 2>/dev/null || true && \
	git checkout -b draft && \
	git add -f public && \
	git commit -am "Publish to master"
	git subtree split --prefix public -b master && \
	git push --force origin master:master && \
	git checkout dev
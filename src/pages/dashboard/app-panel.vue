<script setup lang="ts">
import { useRoute } from "vue-router";
import { Box } from "lucide-vue-next";

const route = useRoute("/dashboard/app-panel/[id]");

definePage({
  redirect: "/dashboard/app-panel/list",
  meta: {
    title: "router.appPanel",
    icon: Box,
    order: 9,
    group: "router.group.appExtensions",
  },
});
</script>

<template>
  <router-view :key="String(route.params.id)" />
</template>

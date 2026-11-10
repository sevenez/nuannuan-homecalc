package com.nuannuan.homecalc

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/**
 * 极简 WebView 壳：把内置的离线网页当作 App 运行。
 * 之所以用 WebView 而不是原生重写，是因为这个工具本质是「表单 + 列表」，
 * 网页实现可以一套代码同时供 PWA 与 App 使用。
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this).apply {
            setBackgroundColor(0xFFFDF6F4.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true            // localStorage 必须开启，用于保存「我的家园」
                databaseEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                // 跟随系统字体大小（fontScale），且不小于设计基准 100——用户调大系统字体时页面文字同步变大
                textZoom = maxOf(100, (resources.configuration.fontScale * 100).toInt())
                mediaPlaybackRequiresUserGesture = true
            }
            webViewClient = WebViewClient()
            loadUrl("file:///android_asset/index.html")
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // 先问网页有没有要关的浮层/面板（卖整添加面板、材料筛选下拉）：
                // onBack() 返回 "handled" 表示已消费本次返回；无浮层或旧版网页（无 onBack）则退出。
                web.evaluateJavascript(
                    "(window.__app && window.__app.onBack) ? window.__app.onBack() : ''"
                ) { result ->
                    if (result == null || !result.contains("handled")) finish()
                }
            }
        })
    }

    override fun onPause() { super.onPause(); web.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onDestroy() { web.destroy(); super.onDestroy() }
}

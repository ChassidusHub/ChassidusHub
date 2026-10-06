package com.sichoskodeshmobile.background

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.sichoskodeshmobile.MainActivity
import com.sichoskodeshmobile.R

/**
 * The app's user-facing notifications (the download *progress* notification
 * is WorkManager's own foreground notice - see DownloadWorker). Two
 * channels, so each can be muted on its own in Android's settings:
 *
 *  - content: "this week's farbrengens are in" once per Hebrew week;
 *  - downloads done: the background sync finished fetching this week's files.
 *
 * Tapping either opens the app on a deep link (`sichoskodesh://…`, see the
 * intent filter in AndroidManifest.xml and `linking` in App.tsx). All text
 * arrives from JS already in the user's language.
 */
object AppNotifications {
    const val CHANNEL_CONTENT = "sichos_kodesh_content"
    const val CHANNEL_DOWNLOADS_DONE = "sichos_kodesh_downloads_done"

    const val ID_NEW_WEEK = 2001
    const val ID_DOWNLOADS_DONE = 2002

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_CONTENT) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_CONTENT, "This week's farbrengens", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "A heads-up when a new week's kvius farbrengens are available"
                },
            )
        }
        if (manager.getNotificationChannel(CHANNEL_DOWNLOADS_DONE) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_DOWNLOADS_DONE, "Downloads ready", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "When automatically downloaded content is ready to use offline"
                },
            )
        }
    }

    fun canPost(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun post(context: Context, id: Int, channel: String, title: String, body: String, deepLink: String?) {
        if (!canPost(context)) return
        ensureChannels(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            if (!deepLink.isNullOrEmpty()) data = Uri.parse(deepLink)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_sichos)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Permission revoked between the check and the post - nothing to show.
        }
    }
}

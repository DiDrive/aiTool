$ErrorActionPreference = "Stop"

$font = "C\:/Windows/Fonts/msyh.ttc"
$filter = @"
[0:v]drawbox=x=0:y=0:w=1080:h=1920:color=#090b10:t=fill,drawgrid=width=72:height=72:thickness=1:color=white@0.06,drawtext=fontfile='$font':text='唯变AI工作台':fontcolor=#93A4BD:fontsize=31:x=86:y=1110,drawtext=fontfile='$font':text='内容，别再散着做。':fontcolor=white:fontsize=76:x=86:y=1180,drawtext=fontfile='$font':text='语音      视频      数字人      直播':fontcolor=#2F7BFF:fontsize=31:x=86:y=1330[s0];
[1:v]scale=-1:1920,crop=1080:1920:1100:0,drawbox=x=55:y=250:w=970:h=1200:color=white@0.22:t=2,drawbox=x=0:y=1480:w=1080:h=440:color=#090b10@0.87:t=fill,drawbox=x=78:y=1510:w=4:h=70:color=#2F7BFF:t=fill,drawtext=fontfile='$font':text='视频生成工作流':fontcolor=#DBE7FF:fontsize=29:x=98:y=1525,drawtext=fontfile='$font':text='从提示词到成片，批量生成。':fontcolor=white:fontsize=41:x=78:y=1700[s1];
[2:v]scale=-1:1920,crop=1080:1920:1100:0,drawbox=x=55:y=250:w=970:h=1200:color=white@0.22:t=2,drawbox=x=0:y=1480:w=1080:h=440:color=#090b10@0.87:t=fill,drawbox=x=78:y=1510:w=4:h=70:color=#2F7BFF:t=fill,drawtext=fontfile='$font':text='数字人直播控制台':fontcolor=#DBE7FF:fontsize=29:x=98:y=1525,drawtext=fontfile='$font':text='生成内容，接上数字人直播。':fontcolor=white:fontsize=41:x=78:y=1700[s2];
[3:v]scale=-1:1920,crop=1080:1920:1100:0,boxblur=12:2,eq=brightness=-0.45:saturation=0.55,drawbox=x=0:y=0:w=1080:h=1920:color=#090b10@0.72:t=fill,drawbox=x=88:y=780:w=5:h=105:color=#2F7BFF:t=fill,drawtext=fontfile='$font':text='唯变AI工作台':fontcolor=white:fontsize=78:x=112:y=785,drawtext=fontfile='$font':text='一站式AI数字人系统':fontcolor=#AAB3C2:fontsize=38:x=92:y=905,drawtext=fontfile='$font':text='生成内容，开始直播。':fontcolor=white:fontsize=34:x=92:y=1610[s3];
[s0][s1][s2][s3]concat=n=4:v=1:a=0,format=yuv420p[v]
"@

New-Item -ItemType Directory -Force "final" | Out-Null
& ffmpeg -y `
  -f lavfi -t 2.5 -i "color=c=#090b10:s=1080x1920:r=30" `
  -loop 1 -framerate 30 -t 2.4 -i "assets/pack-b/b-01-seedance-workflow.png" `
  -loop 1 -framerate 30 -t 2.6 -i "assets/pack-b/b-02-live-console.png" `
  -loop 1 -framerate 30 -t 2.5 -i "assets/pack-b/b-02-live-console.png" `
  -filter_complex $filter -map "[v]" -r 30 -c:v libx264 -crf 18 -preset medium -movflags +faststart "final/promo.mp4"

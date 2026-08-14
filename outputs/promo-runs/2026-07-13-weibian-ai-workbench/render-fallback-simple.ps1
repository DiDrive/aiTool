$ErrorActionPreference = "Stop"

$filter = @"
[0:v]drawbox=x=0:y=0:w=1080:h=1920:color=#090b10:t=fill,drawgrid=width=72:height=72:thickness=1:color=white@0.06,drawbox=x=86:y=1110:w=6:h=300:color=#2F7BFF:t=fill,drawbox=x=120:y=1145:w=420:h=56:color=white@0.95:t=fill,drawbox=x=120:y=1230:w=610:h=56:color=white@0.95:t=fill,drawbox=x=120:y=1315:w=330:h=20:color=#2F7BFF:t=fill[s0];
[1:v]scale=-1:1920,crop=1080:1920:1100:0,drawbox=x=55:y=250:w=970:h=1200:color=white@0.22:t=2,drawbox=x=0:y=1480:w=1080:h=440:color=#090b10@0.87:t=fill,drawbox=x=78:y=1510:w=4:h=70:color=#2F7BFF:t=fill,drawbox=x=98:y=1525:w=320:h=26:color=white@0.92:t=fill,drawbox=x=78:y=1690:w=720:h=34:color=white@0.92:t=fill[s1];
[2:v]scale=-1:1920,crop=1080:1920:1100:0,drawbox=x=55:y=250:w=970:h=1200:color=white@0.22:t=2,drawbox=x=0:y=1480:w=1080:h=440:color=#090b10@0.87:t=fill,drawbox=x=78:y=1510:w=4:h=70:color=#2F7BFF:t=fill,drawbox=x=98:y=1525:w=400:h=26:color=white@0.92:t=fill,drawbox=x=78:y=1690:w=760:h=34:color=white@0.92:t=fill[s2];
[3:v]scale=-1:1920,crop=1080:1920:1100:0,boxblur=12:2,eq=brightness=-0.45:saturation=0.55,drawbox=x=0:y=0:w=1080:h=1920:color=#090b10@0.72:t=fill,drawbox=x=88:y=780:w=5:h=210:color=#2F7BFF:t=fill,drawbox=x=112:y=785:w=620:h=64:color=white@0.95:t=fill,drawbox=x=112:y=875:w=430:h=64:color=white@0.95:t=fill,drawbox=x=92:y=1025:w=460:h=24:color=#AAB3C2:t=fill,drawbox=x=92:y=1600:w=520:h=22:color=white@0.9:t=fill[s3];
[s0][s1][s2][s3]concat=n=4:v=1:a=0,format=yuv420p[v]
"@

New-Item -ItemType Directory -Force "final" | Out-Null
& ffmpeg -y `
  -f lavfi -t 2.5 -i "color=c=#090b10:s=1080x1920:r=30" `
  -loop 1 -framerate 30 -t 2.4 -i "assets/pack-b/b-01-seedance-workflow.png" `
  -loop 1 -framerate 30 -t 2.6 -i "assets/pack-b/b-02-live-console.png" `
  -loop 1 -framerate 30 -t 2.5 -i "assets/pack-b/b-02-live-console.png" `
  -filter_complex $filter -map "[v]" -r 30 -c:v libx264 -crf 18 -preset medium -movflags +faststart "final/promo.mp4"

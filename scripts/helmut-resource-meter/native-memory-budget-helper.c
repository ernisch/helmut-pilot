#define _GNU_SOURCE
/* New owned cgroup only. No remount, reclaim, peak reset, loop or business IO. */
#include <sys/stat.h>
#include <sys/vfs.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
static void fail(const char *s) { perror(s); exit(1); }
static unsigned long long number(const char *s) {
 if(!s[0]) { errno=EINVAL; fail("empty integer"); }
 for(const char *p=s;*p;p++) if(*p<'0'||*p>'9') {errno=EINVAL;fail("integer");}
 errno=0;char *end;unsigned long long n=strtoull(s,&end,10);
 if(errno||*end)fail("integer range");
 return n;
}
static int suffix(const char *s,int n) {
 if(strlen(s)!=(size_t)n)return 0;
 for(;*s;s++)if(!strchr("0123456789abcdef",*s))return 0;
 return 1;
}
static int parent_name(const char *s) {
 const char *a="helmut-meter-memorybudget-",*b="helmut-meter-resources";size_t n=strlen(b);
 return (!strncmp(s,a,strlen(a))&&suffix(s+strlen(a),24)) ||
  (!strncmp(s,b,n)&&strlen(s)==n+15&&s[n]>='0'&&s[n]<='9'&&s[n+1]>='0'&&s[n+1]<='9'&&s[n+2]=='-'&&suffix(s+n+3,12));
}
static void value(int d,const char *name,char *b,size_t size) {
 int f=openat(d,name,O_RDONLY|O_CLOEXEC|O_NOFOLLOW);if(f<0)fail("read setting");
 ssize_t n=read(f,b,size-1);if(n<1)fail("read setting bytes");b[n]=0;close(f);
 char *nl=strchr(b,'\n');if(nl)*nl=0;
}
static void setting(int d,const char *name,unsigned long long n) {
 int f=openat(d,name,O_WRONLY|O_CLOEXEC|O_NOFOLLOW);if(f<0)fail(name);
 char b[40];int len=snprintf(b,sizeof b,"%llu",n);
 if(write(f,b,len)!=len)fail("setting write");
 if(close(f))fail("setting close");
 value(d,name,b,sizeof b);if(number(b)!=n){errno=EINVAL;fail("setting readback");}
}
int main(int argc,char **argv) {
 if(argc==3&&!strcmp(argv[1],"hold")&&!strcmp(argv[2],"/output/STOP")) {
  for(int i=0;i<1200;i++){if(access(argv[2],F_OK)==0)return 0;usleep(100000);}
  errno=ETIMEDOUT;fail("owned holder timeout");
 }
 if(argc!=7||strcmp(argv[1],"set")||!parent_name(argv[2])){errno=EINVAL;fail("scope");}
 unsigned long long inode=number(argv[3]),max=number(argv[4]),high=number(argv[5]),swap=number(argv[6]);long page=sysconf(_SC_PAGESIZE);
 if(page<1||max<1048576||max>1548000000ULL||max%(unsigned long long)page||!high||high>=max||high%(unsigned long long)page||swap){errno=EINVAL;fail("bounds");}
 int d=open("/owned-new-parent",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(d<0)fail("owned bind");
 struct stat st;struct statfs fs;if(fstat(d,&st)||fstatfs(d,&fs))fail("owned identity");
 if((unsigned long long)st.st_ino!=inode||fs.f_type!=0x63677270){errno=EINVAL;fail("owned inode or filesystem");}
 const char *names[]={"memory.max","memory.high","memory.swap.max"};char b[40];
 for(int i=0;i<3;i++){value(d,names[i],b,sizeof b);if(strcmp(b,"max")){errno=EINVAL;fail("already configured group");}}
 setting(d,"memory.swap.max",swap);setting(d,"memory.high",high);setting(d,"memory.max",max);
 close(d);puts("{\"newOwnedBudgetSet\":true,\"full500Authority\":false}");return 0;
}

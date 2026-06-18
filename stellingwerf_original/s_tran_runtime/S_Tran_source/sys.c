/*  sys.c  -  routines needed for ansi version of cdat  */
/*  $Id:$  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  version  5.0   7/24/94 - rfs  */
/*  S-Tran version - rfs - 6/03-04  */

#include <time.h>

#define EXTERN extern
#include "s_tran.h"


#define IBIG     1000000000
#define IBIGINV  (1.0/IBIG)
#define ISEED     161803398

static long dummy;           /*  for ran1  */


/*------------------------------  ANSI version used here  */

double get_cpu_time()
{
    return( (double)clock() / CLOCKS_PER_SEC );

}

/*=============random numbers==========*/

double drnd()
{
    return( (double)rand() / (RAND_MAX+1.) + (double)rand() / sq(RAND_MAX+1.) );
}


double rnd()
{
    /* return( (double)rand() / (RAND_MAX+1.) ); */
    return( ran1( &dummy ) );
}

void srnd( int seed )
{
    srand( seed );
    dummy = -seed;
    ran1( &dummy );
}

int iran( int n, int m )
{
    return( (int) ((m - n + 1) * rnd()) + n );
}


/*  clear the stdin buffer, return last character as an unsigned  */

int check_input( unsigned *key )
{

    return(1);
}


double exp2( double x ) 
{
    return( exp( log( 2. ) * x ) );
}


double exp10( double x ) 
{
    return( exp( log( 10. ) * x ) );
}

double logc( double x )
{
    if( !x )  return( 0 );
    return( log( fabs( x ) ) );
}

double log10c( double x )
{
    if( !x )  return( 0 );
    return( log10( fabs( x ) ) );
}


void error(char *s)
{
  printf( "error: %s\n", s );
  getchar();
  exit(1);
}


double sqrtc( double x )
{
    if( x == 0. )  return( 0. );
    else           return( sqrt( fabs( x ) ) );
}

/*  NRC favorite generator, returns rans 0->1, period = 1.e8  */
/*  called here using rnd()  */

#define IA 16807
#define IM 2147483647
#define AM (1.0/IM)
#define IQ 127773
#define IR 2836
#define NTAB 32
#define NDIV (1+(IM-1)/NTAB)
#define EPS 1.2e-7
#define RNMX (1.0-EPS)

double ran1(long *idum)
{
    int j;
    long k;
    static long iy=0;
    static long iv[NTAB];
    double temp;

    if (*idum <= 0 || !iy) {
        if (-(*idum) < 1) *idum=1;
        else *idum = -(*idum);
        for (j=NTAB+7;j>=0;j--) {
            k=(*idum)/IQ;
            *idum=IA*(*idum-k*IQ)-IR*k;
            if (*idum < 0) *idum += IM;
            if (j < NTAB) iv[j] = *idum;
        }
        iy=iv[0];
    }
    k=(*idum)/IQ;
    *idum=IA*(*idum-k*IQ)-IR*k;
    if (*idum < 0) *idum += IM;
    j=iy/NDIV;
    iy=iv[j];
    iv[j] = *idum;
    if ((temp=AM*iy) > RNMX) return RNMX;
    else return temp;
}



/*--------------special error handlers to allow run from icon  ---------------*/

void do_error( char *err_msg )
{
    printf( "\nERROR: %s (v%.2f)\n", err_msg, VERSION );
    do_exit( 2 );
}


void do_exit( int status ) 
{
    if( noexit && status < 5 ) {
        printf( "\n    ....type Enter to continue\n" );
        data_error = TRUE;
        getchar();
        return;
    }
    else {
        printf( "\n    ....type Enter to exit\n" );
        getchar();
        exit(status);
    }
}



/*  the following are implementation of old QNX functions  */

int fgetline(FILE *fp, char *buffer, int max_len)
{
  int len, ch;

  ch = getc(fp);
  if (ch == EOF)
    return(0);

  len = 0;
  while (ch != '\n' && ch != EOF ) {
    buffer[len] = ch;
    len ++;
    if (len >= max_len)
      return(len);
    ch = getc(fp);
  }
  buffer[len] = '\0';
  return(len);
}


int fgetstr( FILE *fp, char *buffer, int max_len)
{
  int len, ch;

  ch = getc(fp);

  if (ch == EOF )
    return(-1);

  len = 0;
  while (ch != '\n' && ch != EOF ) {
    buffer[len] = ch;
    len ++;
    if (len == max_len) {
      buffer[len] = '\0';
      return(len);
    }
    ch = getc(fp);
  }
  buffer[len] = '\0';
  return(len);
}


int fiseek( FILE *fp, int offset)
{
    long loffset;
    int ret;

    loffset = offset;

    ret = fseek(fp,loffset,1);
    if( ret < 0 ) {
        if( offset > 0 ) {
            return(1);
        }
        else {
            return(-1);
        }
    }
    else {
        return(0);
    }
}


double round( double x )
{
    return( (int)floor( x + 0.5 ) );
}


char *substring( char *tmp1, char *tmp2, char *tmp3 )
{
    int i, delim;

    delim = FALSE;
    i = 0;
    do {
        tmp3-=i;
        i = 0;
        do {
            if( *tmp1 == *tmp3 ) {
                delim = TRUE;
                break;
            }
            tmp3++;
            i++;
        } while( *tmp3 != '\0' );
        if( !delim ) {
            *tmp2 = *tmp1;
            tmp2++;
            tmp1++;
        }
        else {
            break;
        }
    } while( *tmp1 != '\0' );
    *tmp2 = '\0';
    if( *tmp1 == '\0' )  return( NULL );
    else                 return( tmp1++ ); 
}

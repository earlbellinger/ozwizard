/*  factor.c - diagonalize the correlation matrix  */
/* $Id: factor.c,v 1.6 1997/11/15 01:19:42 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  rfs - 9/97  */
/*  rfs - 5/04 - port to "S"  */

/*  this is a stand-alone package, no libraries are required  */

/*
purpose:  principal factor analysis - e-vectors of correlation matrix
usage:    factor [file [r threshold [high [debug]]]]
          if no file, will prompt for one   
          threshold is the variance fraction to be covered (0.80)
          high is the level to highlight (0.25)
          debug = 1 for debug

  input:
    n = number of variables    --   NB: opposite of the "S" standard
    m = number of data points
    x[i][j] = data
    Labels[j] = labels

  working arrays:
    aij = correlation matrix
    s1ij = variable i means, using data available in both i and j
    s2ij = sqrt( n ) * sigma ij
*/

                                                /*  prototypes  */
#define EXTERN extern
#include "s_tran.h"

static void jacobi(double **a, int n, double d[], double **v, int *nrot);
static void eigsrt(double d[], double **v, int n);

#define MAXN  50                               /*  max variables  */
#define MAXM  10000                             /*  max data pts  */

#define NR_END  1
#define FREE_ARG char*
#define K_ESC     0

double x[MAXN+1][MAXM+1];
double s1[MAXN+1][MAXN+1], **a, **v, *d, s2[MAXN+1][MAXN+1];
int sign[MAXN+1], count[MAXN+1][MAXN+1];
int n, m, move1, nblanks, nrot;
char work_file[51], stmp2[51];
                                                /*  prototypes  */
static int disp_r( void );
static int disp_v( void );

static double threshold = 0.8, tot_var, high_comp = 0.25;

static int debug = 0, nlast;

extern int na, ne;
extern double tol1, tol2;
extern char Labels[MAX_FIELDS+1][FIELD_LEN+1];
extern double xx[MAX_LINES+1][MAX_FIELDS+1];


int factor()
{
    int i, j, t;
    int out;

    if( tol1 ) {
        threshold = tol1;
        high_comp = tol2;
    }

    n = na;
    m = ne;
                                                /*  arrays */
    a = dmatrix( 1, n, 1, n );
    v = dmatrix( 1, n, 1, n );
    d = dvector( 1, n );

    nblanks = 0;
    for( i = 1; i <= m; i++ ) {
        for( j = 1; j <= n; j++ ) {
            x[j][i] = xx[i][j];
            if( x[i][j] == MISS )  nblanks++;
        }
    }
                                                /*  correlation matrix  */
    for( i = 1; i <= n; i++ ) {
        for( j = 1; j <= n; j++ ) {
            a[i][j] = 0.;
            s1[i][j] = 0.;
            s2[i][j] = 0.;
            for( t = 1; t <= m; t++ ) {
                if( x[i][t] != MISS && x[j][t] != MISS ) {
                    a[i][j] += x[i][t] * x[j][t];
                    s2[i][j] += x[i][t] * x[i][t];
                    s1[i][j] += x[i][t];
                    count[i][j]++;
                }
            }
            if( count[i][j] )  s1[i][j] /= count[i][j];
            if( debug ) printf( "%d,%d: cij=%d aij=%g s1ij=%g s2ij=%g\n", i, j, count[i][j], a[i][j], s1[i][j], s2[i][j] );
        }
    }
    if( debug )  getchar();
                                                /*  diags  */
    for( i = 1; i <= n; i++ ) {
        s1[i][i] = 0;
        s2[i][i] = 0;
        if( !count[i][i] ) {
           printf( "--> Warning: variable %s has no data\n", Labels[i] );
        }
        count[i][i] = 0;
        for( t = 1; t <= m; t++ ) {
            out = 0;

/*  --old missing data scheme - gives 0 for any missing data--
            for( j = 1; j <= n; j++ ) {
                if( x[j][t] == MISS )  out = 1;
            }
*/
            if( x[i][t] == MISS )  out = 1;
            if( out )  continue;

            s2[i][i] += x[i][t] * x[i][t];
            s1[i][i] += x[i][t];
            count[i][i]++;
        }
        if( count[i][i] )  s1[i][i] /= count[i][i];
        if( debug ) printf( "%d,%d: cij=%d       s1ij=%g s2ij=%g\n", i, i, count[i][i], s1[i][i], s2[i][i] );
    }
    for( i = 1; i <= n; i++ ) {
        for( j = 1; j <= n; j++ ) {
            a[i][j] -= s1[i][j] * s1[j][i] * count[i][j];
            s2[i][j] -= s1[i][j] * s1[i][j] * count[i][j];
            s2[i][j] = sqrt( s2[i][j] );
            if( debug )  printf( "%d / %d  aij=%g  s2ij=%g\n", i, j, a[i][j], s2[i][j] );
        }
    }
    for( i = 1; i <= n-1; i++ ) {
        for( j = i+1; j <= n; j++ ) {
            if( s2[i][j]*s2[j][i] != 0. )  a[i][j] /= (s2[i][j] * s2[j][i]);
            else                           a[i][j] = 0.;
            a[j][i] = a[i][j];
        }
    }
    for( i = 1; i <= n; i++ ) {
        a[i][i] = 1.;
        sign[i] = 1;
    }
                                                /*  print problem summary  */

    printf( "\nFACTOR.C:  variables = %d,  data pts = %d\n", n, m );
    printf( "    Total data fields = %d, missing = %d (%.2f%%)\n", n * m, nblanks, 100.*nblanks/(n*m) );

                                                /*  begin computation  */
    if( debug )  disp_r();
    jacobi( a, n, d, v, &nrot );
    eigsrt( d, v, n );
    disp_v();

    return(1);
}

                                                /*  print r array  */
disp_r()
{
    int i, j;

    printf( "\nVariables:\n" );
    for( j = 1; j <= n; j++ ) { 
        printf( "V %3d = %10s", j, Labels[j] );
        if( sign[j] < 0. )  printf( " - anti" );
        printf( "\n" );
    }
    printf( "\nCorrelation Coefficients:\n" );
    printf( "    " );
    for( i = 1; i <= n; i++ )  printf( "%3d ", i );
    for( i = 1; i <= n; i++ ) {
        printf( "\n%3d:", i );
        for( j = 1; j <= n; j++ ) {
            printf( "%3d ", (int)(100 * a[i][j]) );
        }
    }
    printf( "\n" );
    return(1);
}

                                                /*  print results  */
disp_v()
{
    int i, j, k;
    double tmp, vij, h2, xx;
    FILE *fo;

    fo = fopen( "eig.txt", "w" );
                                                /*  e-vals to screen  */

    printf( "\nEigenvalues  Variance Expl. (thresh= %g  rot=%d):\n", threshold, nrot );
    fprintf( fo, "---Factor---" );
    fprintf( fo, "%d-%d Vars, %d-%d Data\n", 2, n+1, n+2, n+m+1 );
    for( j = 1; j <= n; j++ ) { 
        tot_var += d[j] / n;
        printf( "F%-2d = %.3f  %.3f  sum=%.3f\n", j, d[j], d[j] / n, tot_var );

                                                /*  store the results  */
        sprintf( stmp, "F_eig[%d]", j );
        sprintf( stmp2, "%.14e", d[j] );
        register_user_var( stmp, stmp2, 0 );

        if( tot_var > threshold )  break;
    }
                                                /*  store the results  */
    sprintf( stmp, "%d", j );
    register_user_var( "Nfact", stmp, 0 );

    printf( "\n" );
    getchar();
    nlast = j;
    printf( "Eigenvectors:\n" );
    printf( "Variables      " );
    fprintf( fo, "Variables      " );
    for( i = 1; i <= nlast; i++ ) {
        printf( "     F%-2d   ", i );
        fprintf( fo, "     F%-d    ", i );
    }
    printf( "   h2" );
                                                /*  e-vals to file  */
    fprintf( fo, "\n%-15s ", "%var" );
    for( j = 1; j <= nlast; j++ ) { 
        fprintf( fo, "  %6.3f   ", 100 * d[j] / n );
    }
                                                /*  e-vectors  */
    for( i = 1; i <= n; i++ ) {
        printf( "\n%-15s ", Labels[i] );
        fprintf( fo, "\n%-15s ", Labels[i] );
        h2 = 0.;
        for( j = 1; j <= nlast; j++ ) {
            tmp =  fabs( v[i][j] );
            vij = v[i][j] * sqrtc( d[j] );
            h2 += sq( vij );
            if( tmp >= high_comp )  printf( "%c<%6.3f%c> ", K_ESC, vij, K_ESC );
            else                    printf( "  %6.3f   ", vij );
            fprintf( fo, "  %6.3f   ", vij );
                                                /*  store the results  */
            sprintf( stmp, "F_load[%d][%d]", j, i );
            sprintf( stmp2, "%.14e", vij );
            register_user_var( stmp, stmp2, 0 );
        }
        printf( "  %6.3f  ", sqrt( h2 ) );
    }
    printf( "\n" );
    getchar();
                                                /*  data (factors)  */
    printf( "\nFactor Scores\n" );
    printf( "Data    " );
    for( i = 1; i <= nlast; i++ ) {
        printf( "     F%-2d   ", i );
    }
    printf( " Length" );
    for( i = 1; i <= m; i++ ) {
        printf( "\nPt_%-5d ", i );
        fprintf( fo, "\nPt_%-5d ", i );
        h2 = 0.;          
        for( j = 1; j <= nlast; j++ ) {
            vij = 0.;
            for( k = 1; k <= n; k++ ) {
                if( debug >= 2 )  printf( "  i=%d j=%d k=%d  x=%g s2=%g vkj=%g vij=%g\n", i,j,k,x[k][i], s2[i][j], v[k][j], vij );
                if( x[k][i] == MISS )  continue;
                if( s2[k][k] ) {
                    xx = (x[k][i] - s1[k][k]) / ( s2[k][k] / sqrt( m ) );
                }
                else  xx = 0.;
                vij += xx * v[k][j];
            }
            vij /= sqrtc( d[j] );
            h2 += sq( vij );
            tmp = fabs( vij ) /4.;
            if( tmp >= high_comp )  printf( "%c<%6.3f%c> ", K_ESC, vij, K_ESC );
            else                    printf( "  %6.3f   ", vij );
            fprintf( fo, "%6.3f ", vij );
        }
        printf( "%6.3f", sqrt(h2) );
    }
    printf( "\n" );
    fprintf( fo, "\n" );

    fclose( fo );
    printf( "\nE-vect Table in eig.txt\n" );

    return(1);
}


double *dvector(int nl, int nh)
/* allocate a double vector with subscript range v[nl..nh] */
{
    double *v;

    v=(double *)malloc((size_t) ((nh-nl+1+NR_END)*sizeof(double)));
    if (!v) do_error("allocation failure in dvector()");
    return v-nl+NR_END;
}


void free_dvector(double *v, long nl, long nh) /* free a double vector allocated with dvector() */
{
    free((FREE_ARG) (v+nl-NR_END));
}


double **dmatrix(int nrl, int nrh, int ncl, int nch)
/* allocate a double matrix with subscript range m[nrl..nrh][ncl..nch] */
{
    long i, nrow=nrh-nrl+1,ncol=nch-ncl+1;
    double **m;

    /* allocate pointers to rows */
    m=(double **) malloc((size_t)((nrow+NR_END)*sizeof(double*)));
    if (!m) do_error("allocation failure 1 in matrix()");
    m += NR_END;
    m -= nrl;

    /* allocate rows and set pointers to them */
    m[nrl]=(double *) malloc((size_t)((nrow*ncol+NR_END)*sizeof(double)));
    if (!m[nrl]) do_error("allocation failure 2 in matrix()");
    m[nrl] += NR_END;
    m[nrl] -= ncl;

    for(i=nrl+1;i<=nrh;i++) m[i]=m[i-1]+ncol;

    /* return pointer to array of pointers to rows */
    return m;
}


void free_dmatrix(double **m, long nrl, long nrh, long ncl, long nch)
/* free a double matrix allocated by dmatrix() */
{
    free((FREE_ARG) (m[nrl]+ncl-NR_END));
    free((FREE_ARG) (m+nrl-NR_END));
}


/*  jacobi eigenvalues and vectors of a symmetric matrix  */

#define ROTATE(a,i,j,k,l) g=a[i][j];h=a[k][l];a[i][j]=g-s*(h+g*tau);\
    a[k][l]=h+s*(g-h*tau);

void jacobi(double **a, int n, double d[], double **v, int *nrot)
{
    int j,iq,ip,i;
    double tresh,theta,tau,t,sm,s,h,g,c,*b,*z;

    b=dvector(1,n);
    z=dvector(1,n);
                                                /*  initial = identity  */
    for (ip=1;ip<=n;ip++) {
        for (iq=1;iq<=n;iq++) v[ip][iq]=0.0;
        v[ip][ip]=1.0;
    }
                                                /*  b,d = diag a  */
    for (ip=1;ip<=n;ip++) {
        b[ip]=d[ip]=a[ip][ip];
        z[ip]=0.0;
    }
    *nrot=0;
    for (i=1;i<=50;i++) {
        sm=0.0;
                                                /*  sum off-diag elements  */
        for (ip=1;ip<=n-1;ip++) {
            for (iq=ip+1;iq<=n;iq++)
                sm += fabs(a[ip][iq]);
        }
                                                /*  normal return  */
        if (sm == 0.0) {
            free_dvector(z,1,n);
            free_dvector(b,1,n);
            return;
        }
                                                /*  first 3 sweeps  */
        if (i < 4)
            tresh=0.2*sm/(n*n);
        else
            tresh=0.0;
        for (ip=1;ip<=n-1;ip++) {
            for (iq=ip+1;iq<=n;iq++) {
                g=100.0*fabs(a[ip][iq]);
                if (i > 4 && (double)(fabs(d[ip])+g) == (double)fabs(d[ip])
                    && (double)(fabs(d[iq])+g) == (double)fabs(d[iq]))
                    a[ip][iq]=0.0;
                else if (fabs(a[ip][iq]) > tresh) {
                    h=d[iq]-d[ip];
                    if ((double)(fabs(h)+g) == (double)fabs(h))
                        t=(a[ip][iq])/h;
                    else {
                        theta=0.5*h/(a[ip][iq]);
                        t=1.0/(fabs(theta)+sqrt(1.0+theta*theta));
                        if (theta < 0.0) t = -t;
                    }
                    c=1.0/sqrt(1+t*t);
                    s=t*c;
                    tau=s/(1.0+c);
                    h=t*a[ip][iq];
                    z[ip] -= h;
                    z[iq] += h;
                    d[ip] -= h;
                    d[iq] += h;
                    a[ip][iq]=0.0;
                    for (j=1;j<=ip-1;j++) {
                        ROTATE(a,j,ip,j,iq)
                    }
                    for (j=ip+1;j<=iq-1;j++) {
                        ROTATE(a,ip,j,j,iq)
                    }
                    for (j=iq+1;j<=n;j++) {
                        ROTATE(a,ip,j,iq,j)
                    }
                    for (j=1;j<=n;j++) {
                        ROTATE(v,j,ip,j,iq)
                    }
                    ++(*nrot);
                }
            }
        }
        for (ip=1;ip<=n;ip++) {
            b[ip] += z[ip];
            d[ip]=b[ip];
            z[ip]=0.0;
        }
    }
    do_error("Too many iterations in routine jacobi");
}


/*  insert scheme to sort eigenvalues and vectors  */

void eigsrt(double d[], double **v, int n)
{
    int k,j,i,jmax;
    double p, tmp;

    for (i=1;i<n;i++) {
        p=d[k=i];
        for (j=i+1;j<=n;j++)
            if (d[j] >= p) p=d[k=j];
        if (k != i) {
            d[k]=d[i];
            d[i]=p;
            for (j=1;j<=n;j++) {
                p=v[j][i];
                v[j][i]=v[j][k];
                v[j][k]=p;
            }
        }
    }
                                                /*  fix vect signs  */
    for (i=1;i<n;i++) {
        p = 0;
        for (j=1;j<=n;j++) {
            tmp = fabs( v[j][i] );
            if( tmp > p ) {
                p = tmp;
                jmax = j;
            }
        }
        if( v[jmax][i] < 0 ) {
            for (j=1;j<=n;j++) {
                v[j][i] = -v[j][i];
            }
        }
    }
}

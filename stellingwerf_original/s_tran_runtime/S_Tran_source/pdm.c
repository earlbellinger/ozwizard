/*  pdm.c - period analysis package  */
/* $Id: pdm.c,v 1.01 2004/7/15 01:19:42 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  ported to s-tran package - rfs - 7/04  */
/*  from cplib.c - pdm library routines  --  5/84  */

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>

/*--------------------------------------------------------------------------*/

#define MAXDAT   1600000                /*  max data points  */
#define LPOINTS  10                    /*  frequency points to cover line  */
#define SC_MAX   100                   /*  switch point to single cover    */  
#define MAXF     100000                /*  max allowable points in scan    */

#define sq(x)         ((x)*(x))
#define fmax(x1,x2)   ((x1) > (x2) ? (x1) : (x2))
#define fmin(x1,x2)   ((x1) < (x2) ? (x1) : (x2))
#define x(i)          datx[i]
#define y(i)          daty[i]
#define signif(fr)    (370. * pow( fr, 9.34 )/pow( 109.+(1.-fr)*(ne-109), 1.26 ))

/*---local data---*/

static int nseg, nf, debug, bin10;
static int seg_beg_i[11], seg_end_i[11], seg_pts[11], seg[MAXDAT+1];
static double f_min, f_max, delf, trange, dt_avg, segmn[11], sumy2, sig02, sybin[11];

/*--------------------------- prototypes ------------------------------------*/

int pdm( int ne, double datx[], double daty[], double sig[] );
int p_sort( int n, double dat1[], double dat2[], double dat3[], int sgn );

static int binner( double datx[], double daty[], double f, int bin10, int first, int last);
static double dophase( double tt, double t0, double f );
static int segset( int ne, double datx[], double segdev );
static double sqrc( double x );
static void error( char *str );


/*----these globals are provided for optional external control of the process----*/

/*----run params - can be set externally----*/
/*    if zero, default values will be used  */
extern int invert_curve;                          /*  plot negative of curve  */
extern int lpoints;                               /*  number of points to cover line         */
extern double minf0, maxf0;                       /*  freq scan range                        */
extern double segdev;                             /*  sensitivity for segments (big->1 seg)  */
extern int pdm_verbose;                           /*  generate screen output                 */

/*---results - can be used externally----*/
extern double fthmin[4], thmin[4], signf[4];      /* freq,theta,signif at 3 minima    */
extern int nbin[11];

/*--- pdm period analysis --------------------------------------------------------*/
/*  ne = number of data points
    datx - array of x values  (usually time)
    daty - array of y values  (usually magnitudes)
    sig - array of sigmas (s.d of each point) - set to 0 if not known
----------------------------------------------------------------------------------*/

int pdm( int ne, double datx[], double daty[], double sig[] )

{
    int i, j, bins, line_points, ndof;
    double m, s2, seg_x0[11], seg_xrange[11], sum, sumy2_adj, f, f1, theta, th1, th2, phase;
    double tmp;
    char *stp;
    FILE *fo, *fp;

    p_sort( ne, datx, daty, sig, 1 );           /*  sort the data  */

    if( lpoints )  line_points = lpoints;
    else           line_points = LPOINTS;

                                                /*  set segments  */ 
    if( !segdev )  segdev = 2.;
    if( !segset( ne, datx, segdev ) ) return(0); 

    f_min = f_max = 0;
    fo = stdout;
    for( i = 1; i <= 3; i++ ) {
        thmin[i] = 1.;                
        fthmin[i] = 0.;
    }
                                                /*  write data file  */
    fp = fopen( "data.csv", "w" );
    if( invert_curve ) {
        fprintf( fp, "Time,-Val,Sig\n" );
        for( i = 1; i <= ne; i++ ) {
            fprintf( fp, "%g,%g,%g\n", datx[i], -daty[i], sig[i] );
        }
    }
    else {
        fprintf( fp, "Time,Val,Sig\n" );
        for( i = 1; i <= ne; i++ ) {
            fprintf( fp, "%g,%g,%g\n", datx[i], daty[i], sig[i] );
        }
    }
    fclose( fp );
                                                /*  print header  */ 

    if( pdm_verbose ) {
        fprintf( fo, "\n*** PDM PERIOD ANALYSIS ***\n" );
        fprintf( fo, "\nN = %d     DOF = %d, %d\n", ne, ne - 1, ne - 10*nseg );
    }

                                                /*  full data statistics  */
    seg_beg_i[nseg+1] = ne + 1;
    sumy2 = s2 = trange = 0.;
    for( i = 1; i <= nseg; i++ ) {
        seg_end_i[i] = seg_beg_i[i+1] - 1;
        seg_pts[i] = seg_beg_i[i+1] - seg_beg_i[i];
        seg_x0[i] = x( seg_beg_i[i] );
        seg_xrange[i] = x( seg_end_i[i] ) -  x( seg_beg_i[i] );
        trange = fmax( trange, seg_xrange[i] );
        for( j = seg_beg_i[i], sum = 0.; j <= seg_end_i[i]; j++ ) {
            sum += y(j);
            sumy2 += sq(y(j));
        }
        segmn[i] = sum/seg_pts[i];
        s2 += sq(sum)/seg_pts[i];
    }
    sig02 = (sumy2 - s2)/(ne - nseg);

    if( pdm_verbose ) {
        fprintf( fo, "\nSeg:  #    St     N     Tstart    Trange      Mean      Bins\n" );
        for( i = 1; i <= nseg; i++ ) {
            stp = ( seg_pts[i] > SC_MAX ) ? "10/1" : "5/2";
            fprintf( fo, "    %3d   %3d    %3d  %8.2f  %8.2f  %8.2f      %s\n",
                i, seg_beg_i[i], seg_pts[i], seg_x0[i], seg_xrange[i], segmn[i], stp );
        }
        fprintf( fo, "\nStandard Dev = %g, Variance = %g, Trange = %g\n", sqrc(sig02), sig02, trange );
    }

                                                /*  pick scan range  */
    delf = 1./(line_points * trange);
    f_min = delf;
    f_max = 1. / (5. * dt_avg);
    f_max = fmin( f_max, 4. ); 
                                                /*  check and use input params  */
    if( minf0 )  f_min = fmax( 0., minf0 );
    if( maxf0 )  f_max = maxf0;

    nf = (int)((f_max - f_min)/delf + 1);

    if( pdm_verbose ) {
        fprintf( fo, "--> f_min = %g, f_max = %g, delf = %g, nf = %d\n", f_min, f_max, delf, nf);
        
        
        if( nf > MAXF ) {
            printf( "    *** too many points, set to %d ***", MAXF );
            nf = MAXF;
            delf = (f_max - f_min) / (nf - 1);
        }
        if( nf < 1 ) {
            printf( ".*** frequency points=  %d abort scan ***", nf );
            return(0);
        }
        
        fprintf( fo, "\nTHETA SCAN:  F range [%g -> %g]", f_min, f_max );
        
        fprintf( fo, "    %d points/line\n", (int)(1. / (trange * delf )) );
    }

    for( i = 1; i <= nseg; i++ ) {              /*  fix sy2 for double cover  */
        if( seg_pts[i] > SC_MAX )  continue;
        for( j = seg_beg_i[i], m = 0.; j <= seg_end_i[i]; j++ ) {
            sumy2 += sq(y(j));
        }
    }

    fp = fopen( "pdmplot.csv", "w" );
    fprintf( fp, "Frequency,Theta\n" );

    if( pdm_verbose )  printf( "        ***SCANNING***\n" );
                                                        
    theta = th1 = th2 = 1.;                     /*  compute  */
    for( f = f_min; f <= f_max + delf; f += delf ) {      
        th2 = th1;
        th1 = theta;
        s2 = 0.;
        sumy2_adj = sumy2;
        bins = ndof = 0;
        for( i = 1; i <= nseg; i++ ) {
            bin10 = seg_pts[i] > SC_MAX;

            /* fprintf( fo, "\nSEG %d   bin10 = %d\n", i, bin10 ); */

            binner( datx, daty, f, bin10, seg_beg_i[i], seg_end_i[i] );

            for( j = 0; j <= 9; j++ ) {         /*  adjust for singles  */
                if( nbin[j] == 1 )  sumy2_adj -= sq( sybin[j] );
                else if( nbin[j] != 0 ) {       /*  bin statistics  */
                    bins++;
                    ndof += nbin[j] - 1;
                    s2 += sq( sybin[j] ) / nbin[j];
                    if(debug>=2) fprintf( fo, "bin= %d, bn = %d, bm = %6.3g, sx2 = %g, s2 = %g, ndof = %g\n",j,nbin[j],sybin[j]/nbin[j],sumy2_adj,s2,ndof );
                }
            }
        }

        theta = (sumy2_adj - s2) / (ndof * sig02);

        if( debug ) fprintf( fo, "f=%g, sy2=%g, s2=%g, ndof=%g, theta=%g\n", f, sumy2_adj, s2, ndof, theta);

        /* fprintf( fo, "f=%g  theta=%g\n", f, theta);  */
        fprintf( fp, "%g,%g\n", f, theta );

                                                /*  save 3 minima  */
        if( th1 < theta && th1 < th2 ) {
            f1 = f - delf;
            if( debug )  printf( "min, f, th = %14.6e, %14.6e\n", f1, th1 );
            if( th1 < thmin[3] ) {
                if( th1 > thmin[2] ) {
                    thmin[3] = th1;
                    fthmin[3] = f1;
                }
                else if( th1 > thmin[1] ) {
                    thmin[3] = thmin[2];
                    fthmin[3] = fthmin[2];
                    thmin[2] = th1;
                    fthmin[2] = f1;
                }
                else {
                    thmin[3] = thmin[2];
                    fthmin[3] = fthmin[2];
                    thmin[2] = thmin[1];
                    fthmin[2] = fthmin[1];
                    thmin[1] = th1;
                    fthmin[1] = f1;
                }
            }
        }
    }
    fclose( fp );
                                                /*  write out the best light curve  */
    fp = fopen( "pdmcurve.csv", "w" );
    if( invert_curve )  fprintf( fp, "Phase(F=%.4f)(P=%.4f)),-Val,Sigma\n", fthmin[1], 1./fthmin[1] );
    else  fprintf( fp, "Phase(F=%.4f)(P=%.4f)),Val,Sigma\n", fthmin[1], 1./fthmin[1] );
    for( i = 1; i <= ne; i++ ) {
        phase = dophase( x(i), x(1), fthmin[1] );
        if( invert_curve )  tmp = -y(i);
        else                tmp = y(i);
        fprintf( fp, "%g,%g,%g\n", phase, tmp, sig[i] );
    }
    fclose( fp );
                                                /*  summary  */

    if( pdm_verbose ) {
        fprintf( fo, "\nMinima: #   Theta    Frequency   Period    Signif\n" );
        for( i = 1; i <= 3; i++ ) {
            if( thmin[i] <= 0. )  thmin[i] = 1.;
            signf[i] = signif( thmin[i] );
            fprintf( fo, "        %d   %5.3g   %8.5g   %8.5g   %6.3g\n",
                i, thmin[i], fthmin[i], 1./fthmin[i], signf[i] );
        }
    }
    if( fo != stdout ) {
        fclose(fo);
    }

    return(1);
}


     /*------- compute bin sums and numbers  */
     /*------- this is the inner loop -------*/

int binner( double datx[], double daty[], double f, int bin10, int first, int last )
{
    double phase, t0;
    int j, bin1, bin2;

    for( j = 0; j <= 9; j++ ) {
        nbin[j] = 0;
        sybin[j] = 0.;
    }
    t0 = x(first);
    for( j = first; j <= last; j++ ) {

        phase = dophase( x(j), t0, f );
                                                /*  (10,1) bins  */
        if( bin10 ) {
            bin1 = (int)(10.*phase+0.5) % 10;
        }
                                                /*  (5,2) bins)  */
        else {
            bin1 = 2 * ((int)(5.*phase) % 5) + 1;  /*  odd bins  */
            bin2 = 2 * ((int)(5.*phase+0.5) % 5);  /*  even bins  */
            nbin[bin2]  += 1;
            sybin[bin2] += y(j);
        }
        nbin[bin1] += 1;
        sybin[bin1] += y(j);
    }
    return(1);
}


 /*------------------ compute phase at time t  */

double dophase( double tt, double t0, double f )
{
    double t1;

    if( tt < t0 )  error( "\ndophase:  t < t0\n" );
    t1 = (tt - t0) * f;
    return( t1 - (int)( t1 ) );
}


int segset( int ne, double datx[], double segdev )    /*----------------- set segments  */
{
    int i, ndt=0;
    double dt, dtavg, dtrange, dtsum=0;

    seg_beg_i[1] = 1;

    dtrange = x(ne) - x(1);
    dtavg = dtrange / ne;
    nseg = 1;
    for( i = 1; i <= ne-1; i++ ) {
        dt = x(i+1) - x(i);
        if( dt > segdev * dtavg ) {
            nseg++;
            if( nseg >= 11 ) {
                nseg--;
                printf( "***Warning - max segs (10) reached\n" );
                break;
            }
            seg_beg_i[nseg] = i+1;
        }
        else {
            ndt++;
            dtsum += dt;
        }
        seg[i] = nseg;
    }
    seg[ne] = nseg;
    dt_avg = dtsum / ndt;
    if( pdm_verbose )  fprintf( stdout, "\nAuto-Segmentation: segdev = %g,  nseg = %d,  dtrange = %g, dtavg = %g\n", segdev, nseg, dtrange, dtavg );
    return(1);
}


double sqrc( double x )
{
    if( x <= 0. )  return( 0. );
    else           return( sqrt( x ) );
}


void error( char *str )
{
    printf( "%s\n", str );
	getchar();
    exit(1);
}

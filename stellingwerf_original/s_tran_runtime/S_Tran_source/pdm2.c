/*  pdm2.c - period analysis package  */
/* $Id: pdm2.c,v 1.01 2004/8/15 01:19:42 rfs Exp rfs $  */

/*============================================================*
 *    S_TRAN - Copyright (c) 2010, Stellingwerf Consulting    *
 *============================================================*/

/*    Version 4.12 - 4/16/13    */

/*  4.12 - variables needed for Blazhko working in pdm2      */
/*  4/13 max data size increased, May not work on XP         */
/*    Version 4.10 - 3/31/13    */
/*-------------------100 bin option -----------------------------------*/
/*  added in version 4.10 as pdm2b - see User Manual         */

/*  from cplib.c - pdm library routines  --  5/84            */
/*  ported to s-tran package - rfs - 7/04                    */
/*  new version, based on deviation from mean curve          */
/*  8/04 - change the significance to beta distribution      */

/*-------------------10 bin version------------------------------------*/
/*  if less than 100 pts in a segment, make the bins double wide (5/2) */
/*  bin centers are at 0, 0.1, 0.2, ...= ibin/10.                      */

/* this version has the oringinal PDM settings as defaults  */
/* updated confidence levels based on Beta distribution     */
/* NEW options are: 1) linear mean curve, 2) subharmaonic averages  */
/* META analyses include 1) search for changing period, and           */
/*  2) do a Monte-Carlo nalysis to get the confidence levels correct  */

/*  SEE - PDM2_manual.doc & S_Tran Application Guide   */ 

#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>
#include <ctype.h>

/*--------------------------------------------------------------------------*/

#define TRUE  1
#define FALSE 0
#define MISSING -99999

#define LOGICAL    int

#define MAXDATP  160000                /*  max data points, must agree with MAXDAT in command.c  */
#define LPOINTS  10                     /*  frequency points to cover line  */
#define SC_MAX   100                    /*  switch point to single cover    */
#define SC_MAXB  1000                   /*  switch point to single cover  b ver  */   
#define MAXF     1000000                /*  max allowable points in scan    */
#define MAXSEGS  100                    /*  max allowable segments  */
#define MAXBINS  10                     /*  max allowable bins  */
#define MAXBINSB  100                   /*  max allowable bins b ver */
#define THMAX    500                    /*  bins in theta distribution   */

#define sq(x)         ((x)*(x))
#define fmax(x1,x2)   ((x1) > (x2) ? (x1) : (x2))
#define fmin(x1,x2)   ((x1) < (x2) ? (x1) : (x2))
#define x(i)          datx[i]
#define y(i)          daty[i]

/* old form, based on the F test                                                      */
/* #define signif2(th)    (370. * pow( th, 9.34 )/pow( 109.+(1.-th)*(ne-109), 1.26 )) */

/*  this form is the exact analytical result. Tested, looks ok              */
/*    reference: Schwarzenberg-Czerny, 1997, Ap.J. 489, 941-945, eq 11      */
#define signif2(th)    inc_beta( (ne-m0)/2., (m0-1)/2., (ne-m0)*th/(ne-1) )

/*---local data---*/

static int nseg, debug, m0, bign = SC_MAX;
static int seg_beg_i[MAXSEGS+1], seg_end_i[MAXSEGS+1], seg_pts[MAXSEGS+1];
static double sum_all, data_mean, av_sig, sig_var, beta;
static double delf, dt_avg, dt_min, segmn[MAXSEGS+1], seg_var[MAXSEGS+1], seg_var0[MAXSEGS+1];
static double sumy2, sig02, sig2, theta, rscale;
static double daty0[MAXDATP+1];

/*--------------------------- prototypes ------------------------------------*/

int register_user_var( char *name, char *val, int init );
int pdm2( int ne, double datx[], double daty[], double sig[] );
int pdm2b( int ne, double datx[], double daty[], double sig[] );
int p_sort( int n, double dat1[], double dat2[], double dat3[], int sgn );
int i_sort( int n, int dat1[], double dat2[], int sgn );
double inc_beta( double a, double b, double x );
double rnd( void );
double bspl3( double z );
double table_interp( double x0, int n, double xt[], double yt[] );

static int binner( double datx[], double daty[], double sig[], double f, int bin10, int first, int last );
static int binnerb( double datx[], double daty[], double sig[], double f, int bin10, int first, int last );
static double dophase( double tt, double t0, double tn, double f );
static int segset( int ne, double datx[], double daty[], double segdev );
static double sqrc( double x );
static void error( char *str );
static double mcurve( double phase );
static double mcurveb( double phase );


/*----these globals are provided for optional external control of the process----*/

/*----run params - can be set externally----*/
/*    if zero, default values will be used  */
int invert_curve = 0;                      /*  plot negative of curve                 */
int lpoints = 10;                          /*  number of points to cover line         */
double minf0, maxf0;                       /*  freq scan range                        */
double segdev = 2;                         /*  sensitivity for segments (big->1 seg)  */
double beta_min = 0., beta_max = 0.;       /*  period change mode                     */
double beta_scale = 1./365.25e6;           /*  scale factor for beta                  */
double phase_shift = 0.;                   /*  shift for pdmcurve               */
int nb0 = 21;                              /*  points in beta scan                    */
int do_beta_scan = FALSE;                  /*  set to true for beta scan              */
int do_subharm = FALSE;                    /*  subharmonic averaging                  */
int do_dist = 1;                           /*  write theta distribution files         */
int bin_10 = 2;                            /*  0=5/2 bins,1=10/1,2=auto,>2=sw_#/auto  */
int do_linear_fit = FALSE;                 /*  linear curve fitting                   */
int do_spline_fit = FALSE;                 /*  Bspline curve fitting                  */
int pdm_verbose = 1;                       /*  generate screen output                 */
int pdm_debug = 0;                         /*  turn on local debugging                */
int do_non_par = FALSE;                    /*  select nonparametric sig test          */
int nb1 = 250;                             /*  points in Monte Carlo analysis         */
int do_sigmas = TRUE;                      /*  use sigmas in computation              */

/*---results - can be used externally----*/
double trange;                                    /* range of time                    */
double fthmin[4], thmin[4], signf[4];             /* freq,theta,signif at 3 minima    */
double bin_mean[MAXBINSB+1], bin_var[MAXBINSB+1]; /* bin data, mean curve             */
int nbin[MAXBINSB+1], nf;                         /* points per bin / scan            */ 
int theta_dist[THMAX+1], tot_points;              /* numerical theta distribution     */
double dtheta[THMAX+1];                           /* theta values for dist            */
double theta_dist2[THMAX+1];                      /* theta_min distribution           */
int tot_points2;                                  /* npoints for theta_min distr      */
double f_min, f_max, theta2[MAXDATP+1];           /* final theta scan result          */
int ran_array[MAXDATP+1];                         /* for Nemec significance test      */
double ratio;                                     /*  1/(S/N ratio) from sigmas       */
int n0 = 0, n1;                                   /* range in the array               */
char prefix[11] = "pdm";                          /* run prefix                       */
int nplot;                                        /* number of points in plot file    */
double ymin, ymax, yamp, ymean_mean, xmean;       /* mean curve parameters            */


/*--- pdm period analysis --------------------------------------------------------*/
/*  ne = number of data points
    datx - array of x values  (usually time)
    daty - array of y values  (usually magnitudes)
    sig - array of sigmas (s.d of each point) - set to 0 if not known
----------------------------------------------------------------------------------*/

int pdm2( int ne, double datx[], double daty[], double sig[] )

{
    int i, j, k, kk, bins, line_points, sub1_index, big_seg, big_pts, bin10, pts, ntot, pdv;
    int icurr, nb, ne2;
    double s2, s20, seg_x0[MAXSEGS+1], seg_xrange[MAXSEGS+1], sum, sum1, sum2, f, f1, th1, th2, phase, fslope;
    double tmp, tmp2, ymean, bin_mean0[MAXBINS+1], resid, sig0, signf0;
    double th0min[4], delbeta, beta0, ndof, theta_crit, hifact;
    char *stp;
    char stmp[41];
    FILE *fo, *fp, *fp2, *fb;
    
    if( ne <= 10 )  error( "pdm: too few points\n" );
    if( pdm_debug )  debug = TRUE;
    
    fo = stdout; 

    /*  estimate of significant theta level  */
    theta_crit = (bin_10 ? 1. - 11./pow((double)ne,0.8) : 1. - 8/pow((double)ne,0.8));

    /*  theta array for distributions  */
    for( i = 0; i <= THMAX; i++ )  dtheta[i] = 1.2*i/THMAX;
    
    /*----------beta scan option---(changing period)-----------*/
    
    nb = nb0;

    if( do_beta_scan ) {
        pdm_verbose = FALSE;
        fprintf( fo, "\n Beta     Thetamin    F\n" );
        fb = fopen( "beta_scan.csv", "w" );
        if( !fb )  error( "Could not open beta_scan.csv" );
        delbeta = (beta_max - beta_min) / (nb-1);
        if( !delbeta )  error( "Zero range of beta" );

        fprintf( fb, "Beta,Thetamin,F\n" );
    }
    else {
        nb = 1;
    }

    /*--------------------monte-carlo sig option----------------------------*/
    
    if( do_non_par ) {
        printf("\n==========MONTE CARLO SIGNIFICANCE ANALYSIS============\n" );

        nb = nb1;
        for( i = 1; i <= ne; i++ ) {
            daty0[i] = daty[i];
        }

        for( i = 0; i <= THMAX; i++ )  theta_dist2[i] = 0.;
        tot_points2 = 0;
        pdv = pdm_verbose;
        pdm_verbose = FALSE;
    }

    /*=============outer loop for beta or non-par runs=================*/
    
    for( kk = 1; kk <= nb; kk++ ) {
        if( do_beta_scan ) {
            beta0 = beta_min - delbeta + kk * delbeta;
            beta = beta0 * beta_scale;  
        }

        else if( do_non_par ) {
            /*  set to original order  */
            for( i = 1; i <= ne; i++ ) {
                daty[i] = daty0[i];
            }
            /*  final pass  */
            if( kk == nb ) {
                pdm_verbose = pdv;
            }
            else {
                /*  scramble the data set  */
                for( i = 1; i <= ne; i++ ) {
                    ran_array[i] = (int)(1.e8 * rnd());
                }
                i_sort( ne, ran_array, daty, 1 );
                printf( "   iteration %d / %d\r", kk, nb );
            }
        }
        
    /*--------------------------------------------------------*/
        
        /* set bin structure  */
        bin10 = bin_10;
        if( bin_10 > 2 )  bign = bin_10;
        
        p_sort( ne, datx, daty, sig, 1 );           /*  sort the data  */
        
        if( lpoints )  line_points = lpoints;
        else           line_points = LPOINTS;
        
        /*  set segments  */ 
        if( !segdev )  segdev = 2.;
        if( !segset( ne, datx, daty, segdev ) ) return(0);
        
        f_min = f_max = 0;

        /*  write data file  */
        fp = fopen( "data.csv", "w" );
        
        if( invert_curve ) {
            fprintf( fp, "Time,Val-,Sig\n" );
            for( i = 1; i <= ne; i++ ) {
                if( daty[i] == MISSING ) {
                    fprintf( fp, "%18.12g, ,%18.12g\n", datx[i], fabs(sig[i]) );
                }
                else {
                    fprintf( fp, "%18.12g,%18.12g,%18.12g\n", datx[i], -daty[i], fabs(sig[i]) );
                }
            }
        }
        else {
            fprintf( fp, "Time,Val,Sig\n" );
            for( i = 1; i <= ne; i++ ) {
                if( daty[i] == MISSING ) {
                    fprintf( fp, "%18.12g, ,%18.12g\n", datx[i], fabs(sig[i]) );
                }
                else {
                    fprintf( fp, "%18.12g,%18.12g,%18.12g\n", datx[i], daty[i], fabs(sig[i]) );
                }
            }
        }
        fclose( fp );

        /*  sigmas  */
        ne2 = ne;
        if( do_sigmas ) {
            sig_var = av_sig = 0.;
            for( i = 1, sum = 0, s2 = 0l; i <= ne; i++ ) {
                if( y(i) == MISSING ) {
                    ne2--;
                    continue;
                }
                sig[i] = fabs( sig[i] );
                sig_var += sq( sig[i] );
                av_sig += sig[i];
                sum += y(i);
                s2 += sq( y(i) );
            }
            sig_var /= ne2;
            av_sig /= ne2;
            sig2 = (s2 - sq( sum ) / ne2 ) / (ne2 - 1.);
            
            /*  sigma report  */
            if( sig2 )  ratio = sqrt(sig_var / sig2);
            if( ratio ) {
                rscale = fmin( 1., 0.2 / ratio );
            }
            else {
                rscale = 1.;
            }
            if( sig_var && pdm_verbose )  fprintf( fo, "Variance=%.4f, Sig_var=%.4f, Rsc=%.4f\n", sig2, sig_var, rscale );
        }

        /*  print header  */ 
        if( pdm_verbose ) {
            fprintf( fo, "\n*** PDM2 PERIOD ANALYSIS ***\n" );
            fprintf( fo, "\nN = %d     DOF = %d, %d\n", ne2, ne2 - 1, ne2 - 10*nseg );
        }
        
        /*  full data statistics  */
        seg_beg_i[nseg+1] = ne + 1;
        sum_all = s2 = s20 = trange = 0.;
        big_seg = 1;
        big_pts = 0;
        ntot = 0;
        for( i = 1; i <= nseg; i++ ) {
            seg_end_i[i] = seg_beg_i[i+1] - 1;
            seg_pts[i] = seg_beg_i[i+1] - seg_beg_i[i];
            if( seg_pts[i] > big_pts ) {
                big_seg = i;
                big_pts = seg_pts[i];
            }
            seg_x0[i] = x(seg_beg_i[i]);
            seg_xrange[i] = x(seg_end_i[i]) - x(seg_beg_i[i]);
            trange = fmax( trange, seg_xrange[i] );
            /*  loop to get means  */
            for( j = seg_beg_i[i], sum = 0., pts = 0; j <= seg_end_i[i]; j++ ) {
                /*  skip missing  */
                if( y(j) == MISSING )  continue;
                /*  skip outliers  */
                if( do_sigmas && sq( rscale*sig[j] ) > 3. * sig_var )  continue;
                sum_all += y(j);
                sum += y(j);
                pts++;
            }
            segmn[i] = sum / pts;
            ntot += pts;

            /*  full data variance, w/ sig correction  */
            for( j = seg_beg_i[i], sum1 = 0., sum2 = 0.; j <= seg_end_i[i]; j++ ) {
                /*  skip missing  */
                if( y(j) == MISSING )  continue;
                /*  skip outliers  */
                if( do_sigmas && sq( rscale*sig[j] ) > 3. * sig_var )  continue;
                tmp = fabs( y(j) - segmn[i] );
                sum1 += sq( tmp );

                if( do_sigmas ) tmp2 = rscale*sig[j];
                else            tmp2 = 0.;

                tmp = fmax(tmp - tmp2, 0);
                sum2 += sq( tmp );
            }
            if( seg_pts[i] > 1 ) {
                seg_var0[i] = sum1 / (seg_pts[i]-1.);
                seg_var[i] = sum2 / (seg_pts[i]-1.);
            }
            else {
                seg_var0[i] = 0.;
                seg_var[i] = 0.;
            }
            s20 += (seg_pts[i] - 1.) * seg_var0[i];
            s2 += (seg_pts[i] - 1.) * seg_var[i];
        }
        data_mean = sum_all / ntot;
        sig02 = s20 / (ntot - nseg);          /*  sig02 is the normal total variance  */
        sig2 = s2 / (ntot - nseg);            /*  sig2  is corrected for data sigmas  */
        
        /*  segment report  */
        if( pdm_verbose ) {
            fprintf( fo, "\nSeg:  #    St     N     Tstart    Trange      Mean      s.d.     Bins\n" );
            for( i = 1; i <= nseg; i++ ) {
                if( bin10 >= 2 )  stp = ( seg_pts[i] > bign ) ? "10/1" : "5/2";
                else stp = bin10 ? "10/1" : "5/2";
                fprintf( fo, "    %3d   %3d    %3d  %8.2f  %8.2f  %8.2f  %8.2f     %s\n",
                    i, seg_beg_i[i], seg_pts[i], seg_x0[i], seg_xrange[i], segmn[i], sqrt(seg_var[i]), stp );
            }
            fprintf( fo, "\nStandard Dev = %g, Variance = %g, Trange = %g, DTavg=%g\n", sqrc(sig2), sig2, trange, dt_avg );
        }
        
        /*  pick scan range  */
        delf = 1./(line_points * trange);
        f_min = delf;
        f_max = 1. / (2. * dt_avg); 
        /*  check and use input params  */
        if( minf0 )  f_min = fmax( delf, minf0 );
        if( maxf0 )  f_max = maxf0;
        
        nf = (int)((f_max - f_min)/delf + 1);
        hifact = f_max * 2. * trange / ne2;
        
        fslope = (nf-1.) / (f_max-f_min);
        
        if( seg_pts[nseg] > SC_MAX ) m0 = 10;
        else                         m0 = 5;
        
        /*---significance distribution tester------*/
        if( do_dist ) {
            fp = fopen( "sig.csv", "w" );
            fprintf( fp, "Theta,Beta,Beta_bc\n" );
            for( i = 1; i <= 121; i++ ) {
                tmp = (i-1)/100.;
                sig0 = signif2( tmp );
                /*  apply bandwidth correction  */
                //tmp2 = 2.*(float)nf/fmin(5,line_points);
                //tmp2 = 10*dt_avg/dt_min;
                tmp2 = ne2 * hifact;
                if( bin10 )  tmp2 *= 2.;          /*  from monte carlo results  */
                signf0 = 1. - pow( 1-sig0, tmp2); 
                fprintf( fp, "%g,%g,%g\n", tmp, sig0, signf0 );
            }
            fclose( fp );
            if( pdm_verbose )  printf( "Beta distribution written to sig.csv\n" );
        }

        fp = fopen( "pdmplot.csv", "w" );
        fprintf( fp, "Frequency,Theta\n" );
        
        /*-----------------------------------------*/
        
        if( pdm_verbose ) {
            fprintf( fo, "--> f_min = %g, f_max = %g, delf = %g, nf = %d\n", f_min, f_max, delf, nf);
            
            
            if( nf > MAXF ) {
                printf( "     *** too many points, set to %d ***", MAXF );
                nf = MAXF;
                delf = (f_max - f_min) / (nf - 1);
            }
            if( nf < 1 ) {
                printf( ".*** frequency points=  %d abort scan ***", nf );
                return(0);
            }
            
            fprintf( fo, "\nTHETA SCAN:  F range [%g -> %g]", f_min, f_max );
            
            fprintf( fo, "    %d points/line\n", (int)(1. / (trange * delf )) );
            
            printf( "        ***SCANNING***\n" );
        }


        /*--------------------- compute ---------------------------------------*/
        
        if( !do_non_par ) {
            for( i = 0; i <= THMAX; i++ )  theta_dist[i] = 0;
            tot_points = 0;
        }
        
        icurr = 0;
        for( f = f_min, k = 0; f <= f_max + delf; f += delf ) {
            icurr++;
            if( pdm_verbose )  printf( "===scan %d / %d frequency points===\r", icurr, nf );
            if( k ) {
                th2 = th1;
                th1 = theta;
            }
            s2 = 0.;
            bins = 0;
            ndof = 0.;
            for( i = 1; i <= nseg; i++ ) {
                if( bin_10 >= 2 )  bin10 = seg_pts[i] > bign;
                
                /* fprintf( fo, "\nSEG %d   bin10 = %d\n", i, bin10 ); */
                
                binner( datx, daty, sig, f, bin10, seg_beg_i[i], seg_end_i[i] );
                
                for( j = 0; j <= 9; j++ ) {
                    if( nbin[j] > 1 ) {        /*  bin statistics  */
                        bins++;
                        ndof += nbin[j]-1;
                        s2 += (nbin[j] - 1) * bin_var[j];
                    }
                }
            }
            /*=============doit!!===============*/
            k++;
            theta = s2 / (ndof * sig2);
            theta2[k] = theta;                      /*  unaveraged theta array  */
            if( k == 1 ) {
                th1 = th2 = theta;
                thmin[1] = thmin[2] = thmin[3] = theta;
                th0min[1] = th0min[2] = th0min[3] = theta;
                fthmin[1] = fthmin[2] = fthmin[3] = 1.;
            }
            
            /*  subharmonic averaging when possible */
            if( do_subharm ) {
                if( f/2. >= f_min &&  theta < theta_crit ) {
                    sub1_index = (int)(1 + fslope * (f/2 - f_min)+0.5);
                    theta = (theta + theta2[sub1_index])/2.;
                }
            }
            /*  accumulate for distribution  */
            if( do_dist ) {
                i = (int)floor(theta*THMAX/1.2);
                i = fmin( i, THMAX );
                theta_dist[i]++;
                tot_points++;
            }
            
            if( debug ) fprintf( fo, "f=%g, s2=%g, ndof=%g, theta=%g\n", f, s2, ndof, theta);
            
            /* fprintf( fo, "f=%g  theta=%g\n", f, theta);  */
            fprintf( fp, "%20.12f,%20.12f\n", f, theta );
            
            /*  save 3 minima  */
            if( th1 < theta && th1 < th2 ) {
                f1 = f - delf;
                if( debug )  printf( "min, f, th = %14.6e, %14.6e\n", f1, th1 );
                if( th1 < thmin[3] ) {
                    if( th1 > thmin[2] ) {
                        thmin[3] = th0min[3] = th1;
                        fthmin[3] = f1;
                    }
                    else if( th1 > thmin[1] ) {
                        thmin[3] = thmin[2];
                        th0min[3] = th0min[2];
                        fthmin[3] = fthmin[2];
                        thmin[2] = th0min[2] = th1;
                        fthmin[2] = f1;
                    }
                    else {
                        thmin[3] = thmin[2];
                        th0min[3] = th0min[2];
                        fthmin[3] = fthmin[2];
                        thmin[2] = thmin[1];
                        th0min[2] = th0min[1];
                        fthmin[2] = fthmin[1];
                        thmin[1] = th0min[1] = th1;
                        fthmin[1] = f1;
                    }
                }
            }
        }
        fclose( fp );

        /*  accumulate for extreme value distribution  */
        if( do_non_par ) {
            i = (int)floor(thmin[1]*THMAX/1.2);
            i = fmin( i, THMAX );
            theta_dist2[i] += 1.;
            tot_points2++;
        }
        
        /*--------------- write the final data sets -----------------------------*/
        
        fp = fopen( "pdmcurve.csv", "w" );
        fp2 = fopen( "residuals.csv", "w" );
        if( invert_curve )  fprintf( fp, "Phase(F=%.4f)(P=%.6f)),Val-,Mean-,Sigma,Num\n", fthmin[1], 1./fthmin[1] );
        else  fprintf( fp, "Phase(F=%.4f)(P=%.6f)),Val,Mean,Sigma,Num\n", fthmin[1], 1./fthmin[1] );
        
        fprintf( fp2, "X,Resid,Sigma\n" );
        
        binner( datx, daty, sig, fthmin[1], bin10, seg_beg_i[big_seg], seg_end_i[big_seg] );
        
        if( do_spline_fit && thmin[1] < theta_crit ) {
            /*  apply curvature corrections  - use for final mean curve only  */
            /*  will show on mean curve plot and improve residuals            */
            /*    equivalent to a converged Stobie iteration                  */
            for( j = 0; j <= 10; j++ ) {
                bin_mean0[j] = bin_mean[j];
            }
            for( j = 1; j <= 9; j++ ) {
                bin_mean[j] = (3.*bin_mean0[j] - 0.5*(bin_mean[j-1] + bin_mean[j+1])) / 2.;
            }
            bin_mean[0] = (3.*bin_mean0[0] - 0.5*(bin_mean[9] + bin_mean[1])) / 2.;
            bin_mean[10] = bin_mean[0];
        }       
        /*------------- write data versus phase and residuals ------------------------*/
        /*  do for largest segment only to get meaningful data    */
        
        ymean_mean = 0.;
        for( i = seg_beg_i[big_seg]; i <= seg_end_i[big_seg]; i++ ) {

            if( y(i) == MISSING )  continue;
            
            phase = dophase( x(i), x(seg_beg_i[big_seg]), x(seg_end_i[big_seg]), fthmin[1] );
            /*  compute mean curve  */
            ymean = mcurve( phase );
            resid = y(i) - ymean;
            /* plot data at given phases  */
            if( invert_curve ) {
                tmp = -y(i);
                ymean *= -1.;
            }
            else  tmp = y(i);

            if( i == seg_beg_i[big_seg] )  ymin = ymax = ymean;
            ymax = fmax( ymax, ymean);
            ymin = fmin( ymin, ymean );
            ymean_mean += ymean;
            
            tmp2 = fabs(sig[i]);
            
            fprintf( fp, "%g,%18.12g,%g,%g,%d\n", phase, tmp, ymean, tmp2, i );
            fprintf( fp2, "%18.12g,%18.12g,%g\n", x(i), resid, tmp2 );
        }
        fclose( fp );
        if( pdm_verbose )  printf( "Phased data and mean curve written to pdmcurve.csv\n" );
        fclose( fp2 );
        if( pdm_verbose )  printf( "Residuals written to residuals.csv\n" );

        /*  parameters for mean curve  */
        yamp = ymax - ymin;
        xmean = (x(seg_beg_i[big_seg])+x(seg_end_i[big_seg])) / 2.;
        nplot = seg_end_i[big_seg] - seg_beg_i[big_seg] + 1;
        ymean_mean /= nplot;

        /*  set up uaer variables  */
        sprintf( stmp, "%g", ymax );
        register_user_var( "Ymax", stmp, 0 );
        sprintf( stmp, "%g", ymin );
        register_user_var( "Ymin", stmp, 0 );
        sprintf( stmp, "%g", yamp );
        register_user_var( "Yamp", stmp, 0 );
        sprintf( stmp, "%g", xmean );
        register_user_var( "Tmean", stmp, 0 );
        sprintf( stmp, "%g", 1./fthmin[1] );
        register_user_var( "Period", stmp, 0 );
        sprintf( stmp, "%g", ymean_mean );
        register_user_var( "Ymean", stmp, 0 );
        sprintf( stmp, "%d", nplot );
        register_user_var( "Nplot", stmp, 0 );
        
        /*  distribution plot  */
        if( do_dist ) {
            fp = fopen( "theta_dist.csv", "w" );
            if( !fp )  error( "Could not open theta_dist" );
            fprintf( fp, "Theta,Dist,Dist_min\n" );
            tmp = 0.;
            tmp2 = 0.;
            for(i = 0; i <= THMAX; i++ ) {
                tmp += (double)theta_dist[i]/tot_points;
                if( do_non_par )  tmp2 += theta_dist2[i]/tot_points2;
                fprintf( fp, "%g,%g,%g\n", dtheta[i], tmp, tmp2 );
            }
            fclose( fp );
            if( pdm_verbose )  printf( "Theta distribution written to theta_dist.csv\n" );
        }

        /*=======  compute significances here  =======*/
        if( do_non_par && kk == nb ) {
            tmp2 = 0.;
            for(i = 0; i <= THMAX; i++ ) {
                tmp2 += theta_dist2[i]/tot_points2;
                theta_dist2[i] = tmp2;
            }
            for( i = 1; i <= 3; i++ ) {
                signf[i] = table_interp( th0min[i], THMAX, dtheta, theta_dist2 );
            }
            if( pdm_verbose )  fprintf( fo, "\nMinima: #    Theta     Frequency    Period  Signif(MC)\n" );
        }
        else {
            for( i = 1; i <= 3; i++ ) {
                sig0 = signif2( th0min[i] );
                /*  apply bandwidth correction  */
                //tmp = 2.*(float)nf/fmin(5,line_points);
                //tmp = 10*dt_avg/dt_min;
                //tmp2 = ne;
                tmp = ne * hifact;
                if( bin10 )  tmp *= 2.;          /*  from monte carlo results  */
                signf[i] = 1. - pow( 1. - sig0, tmp); 
                if( thmin[i] <= 0. )  thmin[i] = 0.;
            }
            if( pdm_verbose )  fprintf( fo, "\nMinima: #    Theta     Frequency    Period   Signif(beta)\n" );
        }

        /*=======  screen summary  =======*/
        if( pdm_verbose ) {
            //fprintf( fo, "\nMinima: #    Theta     Frequency    Period     Signif\n" );
            for( i = 1; i <= 3; i++ ) {
                fprintf( fo, "        %d   %6.6f   %8.6f   %8.6f   %6.6f\n",
                    i, thmin[i], fthmin[i], 1./fthmin[i], signf[i] );
            }
        }

        if( do_beta_scan) {
            fprintf( fo, " %5.5f  %5.5f  %5.5f, \n", beta0, thmin[1], fthmin[1] );
            fprintf( fb, "%g,%g,%g\n", beta0, thmin[1], fthmin[1] );
        }
        if( fo != stdout ) {
            fclose(fo);
        }
    }    // end of k block
    
    if( do_beta_scan ) {
        fprintf( fo, "\nScan finished, data in beta_scan.csv\n" );
        fclose( fb );
    }
    if( do_non_par ) {
        printf( "\n %d data distributions analyzed\n   theta distributions are in theta_dist.csv\n", nb );
    }
    return(1);
}



/*------ compute value of mean curve fit to data at given phase ---------------------------*/
/*    pick frequency first and call binner()                */
/*    this is a linear interp between bin means             */
/*    optional: do a Bspline fit                            */

double mcurve( double phase )
{
    int i0, i1, i2, i3, j0, j1, j2, j3;
    double phase0, ymean;

    /*  i1 = left bin, i2 = right bin number   */
    /*  i's are for means, j's for the phases  */

    i1 = (int)floor(10.*phase)%10;
    if( i1 < 0 )  i1 += 10;
    i2 = i1 + 1;
    i0 = i1 - 1;
    if( i0 < 0 )  i0 += 10;
    i3 = i2 + 1;
    if( i3 > 10 )  i3 -= 10;

    j1 = i1;
    j0 = j1-1;
    j2 = j1+1;
    j3 = j2+1;

    /*  this takes care of the first 1/2 bin  */
    if( phase < 0.5 && i1 > 5 )  phase0 = phase + 1;
    else                         phase0 = phase;


    /*  4 splines contribute to each point inthe curve  */
    if( do_spline_fit ) {
        ymean = bin_mean[i1] * bspl3(10.*phase0 - j1) + bin_mean[i2] * bspl3(j2 - 10.*phase0);
        ymean += bin_mean[i0] * bspl3(10.*phase0 - j0) + bin_mean[i3] * bspl3(j3 - 10.*phase0);
    }
    /*  for linear fit, only two points contribute  */
    else if( do_linear_fit ) {
        ymean = bin_mean[i1] + 10. * (bin_mean[i2] - bin_mean[i1]) * (phase0 - i1/10.);
    }
    else {
        i1 = (int)(10.*phase+0.5) % 10;
        ymean = bin_mean[i1];
    }
    return( ymean );
}


/*------- compute bin sums and numbers ----------------------------------------------*/

int binner( double datx[], double daty[], double sig[], double f, int bin10, int first, int last )
{
    double phase, t0, tn, sybin[MAXBINS+1], sumy2_dev[MAXBINS+1], ymean=0; 
    double tmp, theta0, dev, dev0, bm1, bm2;
    int i, j, bin1, bin2, n0;
    int do_curve;

    /*  inits  */
    for( j = 0; j <= 9; j++ ) {
        nbin[j] = 0;
        sybin[j] = 0.;
        sumy2_dev[j] = 0.;
    }

    t0 = x(first);
    tn = x(last);

    /*  compute bin statistics  */
    for( j = first; j <= last; j++ ) {
                                                /*  skip missing values  */
        if( y(j) == MISSING )  continue;
                                                /*  skip outliers  */
        if( do_sigmas && sq( sig[j] ) > 3. * sig_var )  continue;

        phase = dophase( x(j), t0, tn, f );
                                                /*  (10,1) bins  */
                                                /* bins are 0->9, center of b0 at 0  */
        if( bin10 ) {
            bin1 = (int)(10.*phase+0.5) % 10;
            nbin[bin1] += 1;
            sybin[bin1] += y(j);
        }
                                                /*  (5,2) bins)  */
        else {
            bin1 = 2 * ((int)(5.*phase) % 5) + 1;   /*  odd bins  */
            bin2 = 2 * ((int)(5.*phase+0.5) % 5);   /*  even bins  */
            nbin[bin1] += 1;
            sybin[bin1] += y(j);
            nbin[bin2] += 1;
            sybin[bin2] += y(j);
        }
    }

    /*  compute bin means - bin 0 has at least 1 point  */
    for( j = 0; j <= 9; j++ ) {
        if( nbin[j] )  bin_mean[j] = sybin[j] / nbin[j];
    }
    bin_mean[10] = bin_mean[0];
    /*  fix empty bins  */
    for( j = 1; j <= 9; j++ ) {
        if( !nbin[j] ) {
            for( i = j+1; i <= 10; i++ ) {
                if( nbin[i] ) {
                    bm1 = bin_mean[j-1];
                    bm2 = bin_mean[i];
                    bin_mean[j] = bm1 + (bm2-bm1)/(i-j+1);
     /*printf( "Bin %d empty, bin %d mean=%g, bin %d mean=%g, final=%g\n", j, j-1, bin_mean[j-1], i, bin_mean[i], bin_mean[j] );
       getchar(); */
                    break;
                }
            }
        }
    }
                                                /*  well below noise result  */
    n0 = fmax( last - first, 2 );
    theta0 = (bin10 ? 1. - 11./pow((double)n0,0.8) : 1. - 8./pow((double)n0,0.8));

    do_curve = FALSE;
                                                /*  compute bin variances  */
    for( j = first; j <= last; j++ ) {
                                                /*  skip missing values  */
        if( y(j) == MISSING )  continue;
                                                /*  skip outliers  */
        if( do_sigmas && sq( sig[j] ) > 3. * sig_var )  continue;

        phase = dophase( x(j), t0, tn, f );
                                                /*  compute mean curve at minima  */
        if( j > first && (do_linear_fit || do_spline_fit) && theta < theta0 ) { 
            do_curve = TRUE;
            ymean = mcurve( phase );
        }
        /*  sig check  */
        if( do_sigmas ) tmp = rscale*sig[j];
        else            tmp = 0.;
                                                /*  (10,1) bins  */
        if( bin10 ) {
            bin1 = (int)(10.*phase+0.5) % 10;
            if( !do_curve )  ymean = bin_mean[bin1];
            dev0 = fabs(y(j) - ymean);
                                                /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin1] += sq( dev  );
        }
                                                /*  (5,2) bins)  */
        else {
            bin1 = 2 * ((int)(5.*phase) % 5) + 1;   /*  odd bins  */
            bin2 = 2 * ((int)(5.*phase+0.5) % 5);   /*  even bins  */

            if( !do_curve )  ymean = bin_mean[bin2];
            dev0 = fabs(y(j) - ymean);
                                                /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin2] += sq( dev );
//printf( "BIN2: dev0=%g, dev=%g sig=%g\n", dev0, dev, sig[j] );
            if( !do_curve ) {
                ymean = bin_mean[bin1];
                dev0 = fabs(y(j) - ymean);
            }
                                                /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin1] += sq( dev  );
        }

//printf( "BIN1:  dev0=%g, dev=%g sig=%g\n", dev0, dev, sig[j] );
    }

    for( j = 0; j <= 9; j++ ) {
        if( nbin[j] > 1 )  bin_var[j] = sumy2_dev[j] / (nbin[j] - 1);
        else               bin_var[j] = 0.;
    }
    return(1);
}


 /*------------------ compute phase at time t --------------------------------*/

double dophase( double tt, double t0, double tn, double f )
{
    double t1, tav;

    if( tt < t0 ) {
        printf( "\ndophase:  t = %18.12g < t0 = %18.12g\n", tt, t0 );
    }
    tav = (t0 + tn) / 2.;
    t1 = (tt - t0) * f * (1. - beta * (tt - tn));   /*  beta is the period change rate  */
    return( t1 - floor( t1 ) );
}



/*----------------- set segments ---------------------------------------------*/

int segset( int ne, double datx[], double daty[], double segdev ) 
{
    int i, ndt=0, first=1;
    double dt, dtmin, dtavg, dtrange, dtsum=0;
    double tcurr, tprev;

    dtrange = x(ne) - x(1);
    dtavg = dtrange / ne;
    dtmin = x(2) - x(1);
    nseg = 1;
    for( i = 1; i <= ne-1; i++ ) {
        if( y(i) == MISSING )  continue;
        if( first ) {
            tprev = x(i);
            seg_beg_i[1] = i;
            first = 0;
            continue;
        }
        tcurr = x(i);
        dt = tcurr - tprev;
        tprev = tcurr;
        if( !dt )  continue;       //  drop dup pts
        if( dt > segdev * dtavg ) {
            nseg++;
            if( nseg > MAXSEGS ) {
                nseg--;
                printf( "***Warning - max segs (%d) reached, last %d points not seg'ed\n", MAXSEGS, ne-i );
                break;
            }
            seg_beg_i[nseg] = i+1;
        }
        else {
            ndt++;
            dtsum += dt;
            dtmin = fmin( dtmin, dt);
        }
    }
    if( ndt ) {
        dt_avg = dtsum / ndt;
        dt_min = dtmin;
    }
    if( pdm_verbose ) {
        fprintf( stdout, "\nAuto-Segmentation: segdev = %g,  nseg = %d,  dtrange = %g, dtavg = %g\n", segdev, nseg, dtrange, dtavg );
    }
    return(1);
}


/*  heap sort:
    sort on dat1, but also interchange dat2 use sgn to get reverse sort
    if two dat1 elements are equal, use dat2 to order
    dat3 also reordered, but not tested
    n = number of elements to sort, so partial arrays can be handled
    array index runs from 1 -> n                                       */

int p_sort( int n, double dat1[], double dat2[], double dat3[], int sgn ) 
{
    int ihire, j, iret, i;
    double tmp1, tmp2, tmp3;

    ihire = (n >> 1) + 1;
    iret = n;
    for( ;; ) {
        if( ihire > 1 ) {
            tmp1 = dat1[--ihire];       /*  first hire workers  */
            tmp2 = dat2[ihire];
            tmp3 = dat3[ihire];
        }
        else {
            tmp1 = dat1[iret];
            tmp2 = dat2[iret];
            tmp3 = dat3[iret];
            dat1[iret] = dat1[1];
            dat2[iret] = dat2[1];
            dat3[iret] = dat3[1];
            if( --iret == 1 ) {         /*  then retire them  */
                dat1[1] = tmp1;
                dat2[1] = tmp2;
                dat3[1] = tmp3;
                return(1);
            }
        }
                                        /*  bubble tmp1 down to its level  */
        i = ihire;                      /*  current level  */
        j = ihire << 1;                 /*  first underling   */
        while( j <= iret ) {
            if( (j < iret && sgn * dat1[j] < sgn * dat1[j+1]) ||
                (dat1[j] == dat1[j+1] && sgn * dat2[j] < sgn * dat2[j+1]) )  ++j;
            if( (sgn * tmp1 < sgn * dat1[j]) ||
                ((tmp1 == dat1[j]) && (sgn * tmp2 < sgn * dat2[j])) ) {
                dat1[i] = dat1[j];
                dat2[i] = dat2[j];
                dat3[i] = dat3[j];
                j += (i=j);
            }
            else j = iret + 1;
        }
        dat1[i] = tmp1;
        dat2[i] = tmp2;
        dat3[i] = tmp3;
    }
}


/*  same as above, but modified for data reordering  */

int i_sort( int n, int dat1[], double dat2[], int sgn ) 
{
    int ihire, j, iret, i;
    int tmp1; 
    double tmp2;

    ihire = (n >> 1) + 1;
    iret = n;
    for( ;; ) {
        if( ihire > 1 ) {
            tmp1 = dat1[--ihire];       /*  first hire workers  */
            tmp2 = dat2[ihire];
        }
        else {
            tmp1 = dat1[iret];
            tmp2 = dat2[iret];
            dat1[iret] = dat1[1];
            dat2[iret] = dat2[1];
            if( --iret == 1 ) {         /*  then retire them  */
                dat1[1] = tmp1;
                dat2[1] = tmp2;
                return(1);
            }
        }
                                        /*  bubble tmp1 down to its level  */
        i = ihire;                      /*  current level  */
        j = ihire << 1;                 /*  first underling   */
        while( j <= iret ) {
            if( (j < iret && sgn * dat1[j] < sgn * dat1[j+1]) ||
                (dat1[j] == dat1[j+1] && sgn * dat2[j] < sgn * dat2[j+1]) )  ++j;
            if( (sgn * tmp1 < sgn * dat1[j]) ||
                ((tmp1 == dat1[j]) && (sgn * tmp2 < sgn * dat2[j])) ) {
                dat1[i] = dat1[j];
                dat2[i] = dat2[j];
                j += (i=j);
            }
            else j = iret + 1;
        }
        dat1[i] = tmp1;
        dat2[i] = tmp2;
    }
}


/*  linear interpolate x0 in the table xt / yt  */
/*  xt assumed monotonic, n is the array size   */

double table_interp( double x0, int n, double xt[], double yt[] )
{
    double tmp;
    int i, err=0;

    if( x0 < xt[1] || x0 > xt[n] ) {
        printf( "    table_interp: value out of range" );
        err = 1;
    }
    for( i = 1; i <= n-1; i++ ) {
        if( x0 > xt[i] && x0 < xt[i+1] ) break;
    }
    tmp = yt[i] + (x0 - xt[i]) * (yt[i+1] - yt[i]) / (xt[i+1] - xt[i]);

    if( err ) {
        printf( "\n    interp x0 = %g, n=%d, i = %d, ret=%g\n", x0, n, i, tmp );
        printf( "      xs = %g %g  ys = %g %g\n", xt[i], xt[i+1], yt[i], yt[i+1] );
    }
    return( tmp );
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


/*====================RICH DATA ROUTINE=======================================================*/

int pdm2b( int ne, double datx[], double daty[], double sig[] )

{
    int i, j, k, kk, bins, line_points, sub1_index, big_seg, big_pts, bin10, pts, ntot, pdv;
    int icurr, nb;
    double s2, s20, seg_x0[MAXSEGS+1], seg_xrange[MAXSEGS+1], sum, sum1, sum2, f, f1, th1, th2, phase, fslope;
    double tmp, tmp2, ymean, bin_mean0[MAXBINSB+1], resid, sig0, signf0;
    double th0min[4], delbeta, beta0, ndof, theta_crit, hifact, xmean2;
    char *stp;
    char file[31], stmp[41];
    char root[31];
    int write;
    FILE *fo, *fp, *fp2, *fb;
    
    //printf("Received root as %s from main\n",root);
    strcpy( root, prefix );
    write = 1;
    
    if( ne <= 100 )  error( "pdm: too few points\n" );
    if( pdm_debug )  debug = TRUE;
    
    fo = stdout; 
    
    /*  estimate of significant theta level  */
    theta_crit = (bin_10 ? 1. - 11./pow((double)ne,0.8) : 1. - 8/pow((double)ne,0.8));
    
    /*  theta array for distributions  */
    for( i = 0; i <= THMAX; i++ )  dtheta[i] = 1.2*i/THMAX;
    
    /*----------beta scan option---(changing period)-----------*/
    
    nb = nb0;
    
    if( do_beta_scan ) {
        pdm_verbose = FALSE;
        fprintf( fo, "\n Beta    Thetamin    F\n" );
        sprintf(file,"%s_beta.csv",root);
        fb = fopen(file, "w" );
        if( !fb )  error( "Could not open beta_scan.csv" );
        delbeta = (beta_max - beta_min) / (nb-1);
        if( !delbeta )  error( "Zero range of beta" );
        
        fprintf( fb, "#Beta,Thetamin,F\n" );
    }
    else {
        nb = 1;
    }
    
    /*--------------------monte-carlo sig option----------------------------*/
    
    if( do_non_par ) {
        printf("\n==========MONTE CARLO SIGNIFICANCE ANALYSIS============\n" );
        
        nb = nb1;
        for( i = 1; i <= ne; i++ ) {
            daty0[i] = daty[i];
        }
        
        for( i = 0; i <= THMAX; i++ )  theta_dist2[i] = 0.;
        tot_points2 = 0;
        pdv = pdm_verbose;
        pdm_verbose = FALSE;
    }
    
    /*=============outer loop for beta or non-par runs=================*/
    
    for( kk = 1; kk <= nb; kk++ ) {
        if( do_beta_scan ) {
            beta0 = beta_min - delbeta + kk * delbeta;
            beta = beta0 * beta_scale;  
        }
        
        else if( do_non_par ) {
            /*  set to original order  */
            for( i = 1; i <= ne; i++ ) {
                daty[i] = daty0[i];
            }
            /*  final pass  */
            if( kk == nb ) {
                pdm_verbose = pdv;
            }
            else {
                /*  scramble the data set  */
                for( i = 1; i <= ne; i++ ) {
                    ran_array[i] = (int)(1.e8 * rnd());
                }
                i_sort( ne, ran_array, daty, 1 );
                printf( "   iteration %d / %d\r", kk, nb );
            }
        }
        
        /*--------------------------------------------------------*/
        
        /* set bin structure  */
        bign = SC_MAXB;
        bin10 = bin_10;
        if( bin_10 > 2 )  bign = bin_10;
        
        p_sort( ne, datx, daty, sig, 1 );           /*  sort the data  */
        
        if( lpoints )  line_points = lpoints;
        else           line_points = 10*LPOINTS;
        
        /*  set segments  */ 
        if( !segdev )  segdev = 2.;
        if( !segset( ne, datx, daty, segdev ) ) return(0);
        
        f_min = f_max = 0;
        
        /*  write data file  */
        sprintf(file,"%s_data.csv",root);
        fp = fopen(file, "w" );
        
        if( invert_curve ) {
            fprintf( fp, "#Time,Val-,Sig\n" );
            for( i = 1; i <= ne; i++ ) {
                if( daty[i] == MISSING ) {
                    fprintf( fp, "%18.12g, %18.12g, %18.12g\n", datx[i], 99.9999999,fabs(sig[i]) );
                }
                else {
                    fprintf( fp, "%18.12g, %18.12g, %18.12g\n", datx[i], -daty[i], fabs(sig[i]) );
                }
            }
        }
        else {
            fprintf( fp, "#Time,Val,Sig\n" );
            for( i = 1; i <= ne; i++ ) {
                if( daty[i] == MISSING ) {
                    fprintf( fp, "%18.12g %18.12g, %18.12g\n", datx[i], 99.9999999,fabs(sig[i]) );
                }
                else {
                    fprintf( fp, "%18.12g, %18.12g, %18.12g\n", datx[i], daty[i], fabs(sig[i]) );
                }
            }
        }
        fclose( fp );
        
        /*  sigmas  */
        if( do_sigmas ) {
            sig_var = av_sig = 0.;
            for( i = 1, sum = 0, s2 = 0l; i <= ne; i++ ) {
                sig[i] = fabs( sig[i] );
                sig_var += sq( sig[i] ) / ne;
                av_sig += sig[i] / ne;
                sum += y(i);
                s2 += sq( y(i) );
            }
            sig2 = (s2 - sq( sum ) / ne ) / (ne - 1.);
            
            /*  sigma report  */
            if( sig2 )  ratio = sqrt(sig_var / sig2);
            if( ratio ) {
                rscale = fmin( 1., 0.2 / ratio );
            }
            else {
                rscale = 1.;
            }
            if( sig_var && pdm_verbose )  fprintf( fo, "Variance=%.4f, Sig_var=%.4f, Rsc=%.4f\n", sig2, sig_var, rscale );
        }
        
        /*  print header  */ 
        if( pdm_verbose ) {
            fprintf( fo, "\n*** PDM2 PERIOD ANALYSIS ***\n" );
            fprintf( fo, "\nN = %d     DOF = %d, %d\n", ne, ne - 1, ne - 10*nseg );
        }
        
        /*  full data statistics  */
        seg_beg_i[nseg+1] = ne + 1;
        sum_all = s2 = s20 = trange = 0.;
        big_seg = 1;
        big_pts = 0;
        ntot = 0;
        for( i = 1; i <= nseg; i++ ) {
            seg_end_i[i] = seg_beg_i[i+1] - 1;
            seg_pts[i] = seg_beg_i[i+1] - seg_beg_i[i];
            if( seg_pts[i] > big_pts ) {
                big_seg = i;
                big_pts = seg_pts[i];
            }
            seg_x0[i] = x(seg_beg_i[i]);
            seg_xrange[i] = x(seg_end_i[i]) - x(seg_beg_i[i]);
            trange = fmax( trange, seg_xrange[i] );
            /*  loop to get means  */
            for( j = seg_beg_i[i], sum = 0., pts = 0; j <= seg_end_i[i]; j++ ) {
                /*  skip missing  */
                if( y(j) == MISSING )  continue;
                /*  skip outliers  */
                if( do_sigmas && sq( rscale*sig[j] ) > 3. * sig_var )  continue;
                sum_all += y(j);
                sum += y(j);
                pts++;
            }
            segmn[i] = sum / pts;
            ntot += pts;
            
            /*  full data variance, w/ sig correction  */
            for( j = seg_beg_i[i], sum1 = 0., sum2 = 0.; j <= seg_end_i[i]; j++ ) {
                /*  skip missing  */
                if( y(j) == MISSING )  continue;
                /*  skip outliers  */
                if( do_sigmas && sq( rscale*sig[j] ) > 3. * sig_var )  continue;
                tmp = fabs( y(j) - segmn[i] );
                sum1 += sq( tmp );
                
                if( do_sigmas ) tmp2 = rscale*sig[j];
                else            tmp2 = 0.;
                
                tmp = fmax(tmp - tmp2, 0);
                sum2 += sq( tmp );
            }
            if( seg_pts[i] > 1 ) {
                seg_var0[i] = sum1 / (seg_pts[i]-1.);
                seg_var[i] = sum2 / (seg_pts[i]-1.);
            }
            else {
                seg_var0[i] = 0.;
                seg_var[i] = 0.;
            }
            s20 += (seg_pts[i] - 1.) * seg_var0[i];
            s2 += (seg_pts[i] - 1.) * seg_var[i];
        }
        data_mean = sum_all / ntot;
        sig02 = s20 / (ntot - nseg);          /*  sig02 is the normal total variance  */
        sig2 = s2 / (ntot - nseg);            /*  sig2  is corrected for data sigmas  */
        
        /*  segment report  */
        if( pdm_verbose ) {
            fprintf( fo, "\nSeg:  #    St     N     Tstart    Trange      Mean      s.d.     Bins\n" );
            for( i = 1; i <= nseg; i++ ) {
                if( bin10 >= 2 )  stp = ( seg_pts[i] > bign ) ? "100/1" : "50/2";
                else stp = bin10 ? "100/1" : "50/2";
                fprintf( fo, "    %3d   %3d    %3d  %8.2f  %8.2f  %8.2f  %8.2f     %s\n",
                    i, seg_beg_i[i], seg_pts[i], seg_x0[i], seg_xrange[i], segmn[i], sqrt(seg_var[i]), stp );
            }
            fprintf( fo, "\nStandard Dev = %g, Variance = %g, Trange = %g, DTavg=%g\n", sqrc(sig2), sig2, trange, dt_avg );
        }
        
        /*  pick scan range  */
        delf = 1./(line_points * trange);
        f_min = delf;
        f_max = 1. / (2. * dt_avg); 
        /*  check and use input params  */
        if( minf0 )  f_min = fmax( delf, minf0 );
        if( maxf0 )  f_max = maxf0;
        
        nf = (int)((f_max - f_min)/delf + 1);
        hifact = f_max * 2. * trange / ne;
        
        fslope = (nf-1.) / (f_max-f_min);
        
        if( seg_pts[nseg] > SC_MAXB ) m0 = 100;
        else                          m0 = 50;
        
        /*---significance distribution tester------*/
        if( do_dist ) {
            sprintf(file,"%s_sig.csv",root);
            fp = fopen(file, "w" );
            fprintf( fp, "#Theta,Beta,Beta_bc\n" );
            for( i = 1; i <= 121; i++ ) {
                tmp = (i-1)/100.;
                sig0 = signif2( tmp );
                /*  apply bandwidth correction  */
                //tmp2 = 2.*(float)nf/fmin(5,line_points);
                //tmp2 = 10*dt_avg/dt_min;
                tmp2 = ne * hifact;
                if( bin10 )  tmp2 *= 2.;          /*  from monte carlo results  */
                signf0 = 1. - pow( 1-sig0, tmp2); 
                fprintf( fp, "%g,%g,%g\n", tmp, sig0, signf0 );
            }
            fclose( fp );
            if( pdm_verbose )  printf( "Beta distribution written to sig.csv\n" );
        }
        
        sprintf(file,"%s_pdmplot.csv",root);
        fp = fopen(file, "w" );
        fprintf( fp, "#Frequency,Theta\n" );
        
        /*-----------------------------------------*/
        
        if( pdm_verbose ) {
            fprintf( fo, "#f_min = %g, f_max = %g, delf = %g, nf = %d\n", f_min, f_max, delf, nf);
            
            
            if( nf > MAXF ) {
                printf( "     *** too many points, set to %d ***", MAXF );
                nf = MAXF;
                delf = (f_max - f_min) / (nf - 1);
            }
            if( nf < 1 ) {
                printf( ".*** frequency points=  %d abort scan ***", nf );
                return(0);
            }
            
            fprintf( fo, "\nTHETA SCAN:  F range [%g -> %g]", f_min, f_max );
            
            fprintf( fo, "    %d points/line\n", (int)(1. / (trange * delf )) );
            
            printf( "        ***SCANNING***\n" );
        }
        
        
        /*--------------------- compute ---------------------------------------*/
        
        if( !do_non_par ) {
            for( i = 0; i <= THMAX; i++ )  theta_dist[i] = 0;
            tot_points = 0;
        }
        
        icurr = 0;
        for( f = f_min, k = 0; f <= f_max + delf; f += delf ) {
            icurr++;
            if( pdm_verbose )  printf( "===scan %d / %d frequency points===\r", icurr, nf );
            if( k ) {
                th2 = th1;
                th1 = theta;
            }
            s2 = 0.;
            bins = 0;
            ndof = 0.;
            for( i = 1; i <= nseg; i++ ) {
                if( bin_10 >= 2 )  bin10 = seg_pts[i] > bign;
                
                /* fprintf( fo, "\nSEG %d   bin10 = %d\n", i, bin10 ); */
                
                binnerb( datx, daty, sig, f, bin10, seg_beg_i[i], seg_end_i[i] );
                
                for( j = 0; j <= 99; j++ ) {
                    if( nbin[j] > 1 ) {        /*  bin statistics  */
                        bins++;
                        ndof += nbin[j]-1;
                        s2 += (nbin[j] - 1) * bin_var[j];
                    }
                }
            }
            /*=============doit!!===============*/
            k++;
            theta = s2 / (ndof * sig2);
            theta2[k] = theta;                      /*  unaveraged theta array  */
            if( k == 1 ) {
                th1 = th2 = theta;
                thmin[1] = thmin[2] = thmin[3] = theta;
                th0min[1] = th0min[2] = th0min[3] = theta;
                fthmin[1] = fthmin[2] = fthmin[3] = 1.;
            }
            
            /*  subharmonic averaging when possible */
            if( do_subharm ) {
                if( f/2. >= f_min &&  theta < theta_crit ) {
                    sub1_index = (int)(1 + fslope * (f/2 - f_min)+0.5);
                    theta = (theta + theta2[sub1_index])/2.;
                }
            }
            /*  accumulate for distribution  */
            if( do_dist ) {
                i = (int)floor(theta*THMAX/1.2);
                i = fmin( i, THMAX );
                theta_dist[i]++;
                tot_points++;
            }
            
            if( debug ) fprintf( fo, "f=%g, s2=%g, ndof=%g, theta=%g\n", f, s2, ndof, theta);
            
            /* fprintf( fo, "f=%g  theta=%g\n", f, theta);  */
            fprintf( fp, "%20.12f,%20.12f\n", f, theta );
            
            /*  save 3 minima  */
            if( th1 < theta && th1 < th2 ) {
                f1 = f - delf;
                if( debug )  printf( "min, f, th = %14.6e, %14.6e\n", f1, th1 );
                if( th1 < thmin[3] ) {
                    if( th1 > thmin[2] ) {
                        thmin[3] = th0min[3] = th1;
                        fthmin[3] = f1;
                    }
                    else if( th1 > thmin[1] ) {
                        thmin[3] = thmin[2];
                        th0min[3] = th0min[2];
                        fthmin[3] = fthmin[2];
                        thmin[2] = th0min[2] = th1;
                        fthmin[2] = f1;
                    }
                    else {
                        thmin[3] = thmin[2];
                        th0min[3] = th0min[2];
                        fthmin[3] = fthmin[2];
                        thmin[2] = thmin[1];
                        th0min[2] = th0min[1];
                        fthmin[2] = fthmin[1];
                        thmin[1] = th0min[1] = th1;
                        fthmin[1] = f1;
                    }
                }
            }
        }
        fclose( fp );
        
        /*  accumulate for extreme value distribution  */
        if( do_non_par ) {
            i = (int)floor(thmin[1]*THMAX/1.2);
            i = fmin( i, THMAX );
            theta_dist2[i] += 1.;
            tot_points2++;
        }
        
        /*--------------- write the final data sets -----------------------------*/
        
        if (write == 1) {
            fp = fopen("pdm2b.out","a");
            fprintf (fp,"%-8s,%10.7f\n",root,1./fthmin[1]);
            fclose(fp);
        }
        sprintf(file,"%s_pdmcurve.csv",root);
        fp = fopen(file, "w" );
        sprintf(file,"%s_residuals.csv",root);
        fp2 = fopen(file, "w" );
        if( invert_curve )  fprintf( fp, "Phase(F=%.5f)(P=%.7f)),Val-,Mean-,Sigma,Num\n", fthmin[1], 1./fthmin[1] );
        else  fprintf( fp, "Phase(F=%.5f)(P=%.7f)),Val,Mean,Sigma,Num\n", fthmin[1], 1./fthmin[1] );
        
        fprintf( fp2, "X,Resid,Sigma\n" );
        
        binnerb( datx, daty, sig, fthmin[1], bin10, seg_beg_i[big_seg], seg_end_i[big_seg] );
        
        if( do_spline_fit && thmin[1] < theta_crit ) {
            /*  apply curvature corrections  - use for final mean curve only  */
            /*  will show on mean curve plot and improve residuals            */
            /*    equivalent to a converged Stobie iteration                  */
            for( j = 0; j <= 100; j++ ) {
                bin_mean0[j] = bin_mean[j];
            }
            for( j = 1; j <= 99; j++ ) {
                bin_mean[j] = (3.*bin_mean0[j] - 0.5*(bin_mean[j-1] + bin_mean[j+1])) / 2.;
            }
            bin_mean[0] = (3.*bin_mean0[0] - 0.5*(bin_mean[99] + bin_mean[1])) / 2.;
            bin_mean[100] = bin_mean[0]; 
        }
        /*------------- write data versus phase and residuals ------------------------*/
        /*  do for largest segment only to get meaningful data    */
        
        ymean_mean = 0.;
        for( i = seg_beg_i[big_seg]; i <= seg_end_i[big_seg]; i++ ) {
            if( y(i) == MISSING )  continue;
            
            phase = dophase( x(i), x(seg_beg_i[big_seg]), x(seg_end_i[big_seg]), fthmin[1] );

            /*  compute mean curve  */
            ymean = mcurveb( phase );
            resid = y(i) - ymean;

            /* plot data at given phases  */
            if( invert_curve ) {
                tmp = -y(i);
                ymean *= -1.;
            }
            else  tmp = y(i);

            if( i == seg_beg_i[big_seg] )  ymin = ymax = ymean;
            ymax = fmax( ymax, ymean);
            ymin = fmin( ymin, ymean );
            ymean_mean += ymean;
            
            tmp2 = sig[i];
            
            fprintf( fp, "%g,%18.12g,%g,%g,%d\n", phase, tmp, ymean, tmp2, i );
            fprintf( fp2, "%18.12g,%18.12g,%g\n", x(i), resid, tmp2 );
        }
        /*  parameters for mean curve  */
        yamp = ymax - ymin;
        xmean = (x(seg_beg_i[big_seg])+x(seg_end_i[big_seg])) / 2.;
		xmean2 = (x(seg_beg_i[1])+x(seg_end_i[nseg])) / 2.;
        nplot = seg_end_i[big_seg] - seg_beg_i[big_seg]+1;
        ymean_mean /= nplot;

        /*  set up uaer variables  */
        sprintf( stmp, "%g", ymax );
        register_user_var( "Ymax", stmp, 0 );
        sprintf( stmp, "%g", ymin );
        register_user_var( "Ymin", stmp, 0 );
        sprintf( stmp, "%g", yamp );
        register_user_var( "Yamp", stmp, 0 );
        sprintf( stmp, "%g", xmean );
        register_user_var( "Tmean", stmp, 0 );
        sprintf( stmp, "%g", xmean2 );
        register_user_var( "Tmean2", stmp, 0 );
        sprintf( stmp, "%g", x(seg_beg_i[big_seg]) );
        register_user_var( "Tstart", stmp, 0 );
        sprintf( stmp, "%g", x(seg_end_i[big_seg]) );
        register_user_var( "Tend", stmp, 0 );
        sprintf( stmp, "%g", 1./fthmin[1] );
        register_user_var( "Period", stmp, 0 );
        sprintf( stmp, "%g", ymean_mean );
        register_user_var( "Ymean", stmp, 0 );
        sprintf( stmp, "%d", nplot );
        register_user_var( "Nplot", stmp, 0 );

        fclose( fp );
        if( pdm_verbose )  printf( "Phased data and mean curve written to pdmcurve.csv\n" );
        fclose( fp2 );
        if( pdm_verbose )  printf( "Residuals written to residuals.csv\n" );
        
        /*  distribution plot  */
        if( do_dist ) {
            sprintf(file,"%s_theta_dist.csv",root);
            fp = fopen(file, "w" );
            if( !fp )  error( "Could not open theta_dist" );
            fprintf( fp, "#Theta,Dist,Dist_min\n" );
            tmp = 0.;
            tmp2 = 0.;
            for(i = 0; i <= THMAX; i++ ) {
                tmp += (double)theta_dist[i]/tot_points;
                if( do_non_par )  tmp2 += theta_dist2[i]/tot_points2;
                fprintf( fp, "%g,%g,%g\n", dtheta[i], tmp, tmp2 );
            }
            fclose( fp );
            if( pdm_verbose )  printf( "Theta distribution written to theta_dist.csv\n" );
        }
        
        /*=======  compute significances here  =======*/
        if( do_non_par && kk == nb ) {
            tmp2 = 0.;
            for(i = 0; i <= THMAX; i++ ) {
                tmp2 += theta_dist2[i]/tot_points2;
                theta_dist2[i] = tmp2;
            }
            for( i = 1; i <= 3; i++ ) {
                signf[i] = table_interp( th0min[i], THMAX, dtheta, theta_dist2 );
            }
            if( pdm_verbose )  fprintf( fo, "\nMinima: #    Theta     Frequency      Period    Signif(MC)\n" );
        }
        else {
            for( i = 1; i <= 3; i++ ) {
                sig0 = signif2( th0min[i] );
                /*  apply bandwidth correction  */
                //tmp = 2.*(float)nf/fmin(5,line_points);
                //tmp = 10*dt_avg/dt_min;
                //tmp2 = ne;
                tmp = ne * hifact;
                if( bin10 )  tmp *= 2.;          /*  from monte carlo results  */
                signf[i] = 1. - pow( 1. - sig0, tmp); 
                if( thmin[i] <= 0. )  thmin[i] = 0.;
            }
            if( pdm_verbose )  fprintf( fo, "\nMinima: #    Theta     Frequency      Period     Signif(beta)\n" );
        }
        
        /*=======  screen summary  =======*/
        if( pdm_verbose ) {
            //fprintf( fo, "\nMinima: #    Theta     Frequency      Period       Signif\n" );
            for( i = 1; i <= 3; i++ ) {
                fprintf( fo, "        %d   %6.6f   %10.8f   %10.8f   %6.6f\n",
                    i, thmin[i], fthmin[i], 1./fthmin[i], signf[i] );
            }
        }
        
        if( do_beta_scan) {
            fprintf( fo, " %5.5f  %5.5f  %5.5f, \n", beta0, thmin[1], fthmin[1] );
            fprintf( fb, "%g %g %g\n", beta0, thmin[1], fthmin[1] );
        }
        if( fo != stdout ) {
            fclose(fo);
        }
    }    // end of k block
    
    if( do_beta_scan ) {
        fprintf( fo, "\nScan finished, data in beta_scan.csv\n" );
        fclose( fb );
    }
    if( do_non_par ) {
        printf( "\n %d data distributions analyzed\n   theta distributions are in theta_dist.csv\n", nb );
    }
    return(1);
}

/*------ compute value of mean curve fit to data at given phase ---------------------------*/
/*    pick frequency first and call binnerb()                */
/*    this is a linear interp between bin means             */
/*    optional: do a Bspline fit                            */

double mcurveb( double phase )
{
    int i0, i1, i2, i3, j0, j1, j2, j3;
    double phase0, ymean;
    
    /*  i1 = left bin, i2 = right bin number   */
    /*  i's are for means, j's for the phases  */
    
    i1 = (int)floor(100.*phase)%100;
    if( i1 < 0 )  i1 += 100;
    i2 = i1 + 1;
    i0 = i1 - 1;
    if( i0 < 0 )  i0 += 100;
    i3 = i2 + 1;
    if( i3 > 100 )  i3 -= 100;
    
    j1 = i1;
    j0 = j1-1;
    j2 = j1+1;
    j3 = j2+1;
    
    /*  this takes care of the first 1/2 bin  */
    if( phase < 0.5 && i1 > 50 )  phase0 = phase + 1;
    else                          phase0 = phase;
    
    
    /*  4 splines contribute to each point inthe curve  */
    if( do_spline_fit ) {
        ymean = bin_mean[i1] * bspl3(100.*phase0 - j1) + bin_mean[i2] * bspl3(j2 - 100.*phase0);
        ymean += bin_mean[i0] * bspl3(100.*phase0 - j0) + bin_mean[i3] * bspl3(j3 - 100.*phase0);
    }
    /*  for linear fit, only two points contribute  */
    else if( do_linear_fit ) {
        ymean = bin_mean[i1] + 100. * (bin_mean[i2] - bin_mean[i1]) * (phase0 - i1/100.);
    }
    else {
        i1 = (int)(100.*phase+0.5) % 100;
        ymean = bin_mean[i1];
    }
    return( ymean );
}


/*------- compute bin sums and numbers ----------------------------------------------*/

int binnerb( double datx[], double daty[], double sig[], double f, int bin10, int first, int last )
{
    double phase, t0, tn, sybin[MAXBINSB+1], sumy2_dev[MAXBINSB+1], ymean=0.; 
    double tmp, theta0, dev, dev0, bm1, bm2;
    int i, j, bin1, bin2, n0;
    int do_curve;
    
    /*  inits  */
    for( j = 0; j <= 99; j++ ) {
        nbin[j] = 0;
        sybin[j] = 0.;
        sumy2_dev[j] = 0.;
    }
    
    t0 = x(first);
    tn = x(last);
    
    /*  compute bin statistics  */
    for( j = first; j <= last; j++ ) {
        /*  skip missing values  */
        if( y(j) == MISSING )  continue;
        /*  skip outliers  */
        if( do_sigmas && sq( rscale*sig[j] ) > 3. * sig_var )  continue;
        
        phase = dophase( x(j), t0, tn, f );
        /*  (100,1) bins  */
        /* bins are 0->99, center of b0 at 0  */
        if( bin10 ) {
            bin1 = (int)(100.*phase+0.5) % 100;
            nbin[bin1] += 1;
            sybin[bin1] += y(j);
        }
        /*  (50,2) bins)  */
        else {
            bin1 = 2 * ((int)(50.*phase) % 50) + 1;   /*  odd bins  */
            bin2 = 2 * ((int)(50.*phase+0.5) % 50);   /*  even bins  */
            nbin[bin1] += 1;
            sybin[bin1] += y(j);
            nbin[bin2] += 1;
            sybin[bin2] += y(j);
        }
    }
    
    /*  compute bin means - bin 0 has at least 1 point  */
    for( j = 0; j <= 99; j++ ) {
        if( nbin[j] )  bin_mean[j] = sybin[j] / nbin[j];
    }
    bin_mean[100] = bin_mean[0];
    /*  fix empty bins  */
    for( j = 1; j <= 99; j++ ) {
        if( !nbin[j] ) {
            for( i = j+1; i <= 100; i++ ) {
                if( nbin[i] ) {
                    bm1 = bin_mean[j-1];
                    bm2 = bin_mean[i];
                    bin_mean[j] = bm1 + (bm2-bm1)/(i-j+1);
                    /*     printf( "Bin %d empty, bin %d mean=%g, bin %d mean=%g, final=%g\n", j, j-1, bin_mean[j-1], i, bin_mean[i], bin_mean[j] );
                    getchar(); */
                    break;
                }
            }
        }
    }
    /*  well below noise result  */
    n0 = fmax( last - first, 2 );
    theta0 = (bin10 ? 1. - 11./pow((double)n0,0.8) : 1. - 8./pow((double)n0,0.8));
    
    do_curve = FALSE;
    /*  compute bin variances  */
    for( j = first; j <= last; j++ ) {
        /*  skip missing values  */
        if( y(j) == MISSING )  continue;
        
        phase = dophase( x(j), t0, tn, f );
        /*  compute mean curve at minima  */
        if( j > first && do_linear_fit  ) { 
            do_curve = TRUE;
            ymean = mcurve( phase );
        }
        /*  sig check  */
        if( do_sigmas ) tmp = rscale*sig[j];
        else            tmp = 0.;
        /*  (100,1) bins  */
        if( bin10 ) {
            bin1 = (int)(100.*phase+0.5) % 100;
            if( !do_curve )  ymean = bin_mean[bin1];
            dev0 = fabs(y(j) - ymean);
            /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin1] += sq( dev  );
        }
        /*  (50,2) bins)  */
        else {
            bin1 = 2 * ((int)(50.*phase) % 50) + 1;   /*  odd bins  */
            bin2 = 2 * ((int)(50.*phase+0.5) % 50);   /*  even bins  */
            
            if( !do_curve )  ymean = bin_mean[bin2];
            dev0 = fabs(y(j) - ymean);
            /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin2] += sq( dev );
            //printf( "BIN2: dev0=%g, dev=%g sig=%g\n", dev0, dev, sig[j] );
            if( !do_curve ) {
                ymean = bin_mean[bin1];
                dev0 = fabs(y(j) - ymean);
            }
            /*  note sigma correction here  */
            dev = fmax( dev0 - tmp, 0. );
            sumy2_dev[bin1] += sq( dev  );
        }
        
        //printf( "BIN1:  dev0=%g, dev=%g sig=%g\n", dev0, dev, sig[j] );
    }
    
    for( j = 0; j <= 99; j++ ) {
        if( nbin[j] > 1 )  bin_var[j] = sumy2_dev[j] / (nbin[j] - 1);
        else               bin_var[j] = 0.;
    }
    return(1);
}
